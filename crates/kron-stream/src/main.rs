//! `kron-stream` — Stream detection engine for the KRON SIEM platform.
//!
//! Consumes enriched events from `kron.enriched.{tenant_id}`, runs the full
//! detection pipeline (IOC bloom filter → SIGMA rule evaluation → ONNX anomaly
//! scoring → risk score → MITRE tagging → entity graph), and publishes
//! serialised [`AlertCandidatePayload`] messages to `kron.alerts.{tenant_id}`
//! for `kron-alert`.
//!
//! # Startup sequence
//!
//! 1. Initialise tracing.
//! 2. Load [`KronConfig`] from `KRON_CONFIG` env var or `/etc/kron/kron.toml`.
//! 3. Build IOC filter and start the background refresh task.
//! 4. Load SIGMA rules from `KRON_STREAM_RULES_DIR`.
//! 5. Load ONNX models from `KRON_STREAM_MODELS_DIR`.
//! 6. Build the [`DetectionPipeline`].
//! 7. For each tenant in `KRON_STREAM_TENANT_IDS`, subscribe a bus consumer
//!    and start a processing task.
//! 8. Await SIGTERM/Ctrl-C then shut down gracefully.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::Context as _;
use bytes::Bytes;
use chrono::Utc;
use kron_ai::{InferenceService, ModelRegistry};
use kron_bus::topics;
use kron_bus::{AdaptiveBus, BusConsumer, BusProducer};
use kron_stream::ioc::{FeedLoader, IocFilter, IocRefreshTask};
use kron_stream::metrics as stream_metrics;
use kron_stream::pipeline::entity_graph::EntityGraph;
use kron_stream::pipeline::processor::{AlertCandidatePayload, DetectionPipeline, PipelineConfig};
use kron_stream::shutdown::ShutdownHandle;
use kron_stream::sigma::fp_classifier::FpClassifier;
use kron_stream::sigma::registry::{CompiledRule, RuleRegistry};
use kron_stream::sigma::{RuleEvaluator, RuleLoader};
use kron_types::ids::TenantId;
use kron_types::KronConfig;
use tracing::instrument;

/// Environment variable pointing to the KRON config file.
const ENV_CONFIG_PATH: &str = "KRON_CONFIG";

/// Default config file path when the environment variable is not set.
const DEFAULT_CONFIG_PATH: &str = "/etc/kron/kron.toml";

/// Consumer poll timeout — how long to block waiting for a bus message.
const POLL_TIMEOUT: Duration = Duration::from_millis(200);

/// IOC feed refresh interval.
const IOC_REFRESH_INTERVAL: Duration = Duration::from_secs(300);

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // -----------------------------------------------------------------------
    // Step 1: Initialise tracing.
    // -----------------------------------------------------------------------
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("KRON_LOG_LEVEL").unwrap_or_else(|_| "info".to_string()))
        .json()
        .init();

    tracing::info!("kron-stream starting");

    // -----------------------------------------------------------------------
    // Step 2: Load configuration.
    // -----------------------------------------------------------------------
    let config_path =
        std::env::var(ENV_CONFIG_PATH).unwrap_or_else(|_| DEFAULT_CONFIG_PATH.to_string());

    let config = KronConfig::from_file(std::path::Path::new(&config_path))
        .with_context(|| format!("loading config from {config_path}"))?;

    // Stream-specific directories come from environment variables so they can
    // be overridden per-deployment without touching the main config file.
    let rules_dir = std::env::var("KRON_STREAM_RULES_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/var/lib/kron/rules"));

    let models_dir = std::env::var("KRON_STREAM_MODELS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/var/lib/kron/models"));

    let alert_threshold: u8 = std::env::var("KRON_STREAM_ALERT_THRESHOLD")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(40);

    // Comma-separated UUIDs of tenants this instance should process.
    let tenant_ids: Vec<TenantId> = std::env::var("KRON_STREAM_TENANT_IDS")
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .filter_map(|s| {
            s.parse::<uuid::Uuid>()
                .map(TenantId::from_uuid)
                .map_err(|e| {
                    tracing::warn!(tenant_id = s, error = %e, "invalid tenant ID — skipping");
                })
                .ok()
        })
        .collect();

    if tenant_ids.is_empty() {
        tracing::warn!("KRON_STREAM_TENANT_IDS is empty — no topics will be consumed");
    }

    // -----------------------------------------------------------------------
    // Step 3: Build IOC filter and start background refresh.
    // -----------------------------------------------------------------------
    let feeds = FeedLoader::default_feeds();
    let feed_loader = Arc::new(FeedLoader::new(feeds).context("building IOC feed loader")?);
    let ioc_filter = Arc::new(IocFilter::new());

    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    let refresh_task = IocRefreshTask::new(
        Arc::clone(&ioc_filter),
        Arc::clone(&feed_loader),
        IOC_REFRESH_INTERVAL,
    );
    let _refresh_handle = refresh_task.spawn(shutdown_rx.clone());

    tracing::info!("IOC filter initialised");

    // -----------------------------------------------------------------------
    // Step 4: Load SIGMA rules.
    // -----------------------------------------------------------------------
    let rule_registry = Arc::new(RuleRegistry::new());
    if rules_dir.exists() {
        let mut loader = RuleLoader::new(rules_dir.clone());
        match loader.load_all() {
            Ok(rules) => {
                let count = rules.len();
                for (source_file, rule) in rules {
                    let classification = FpClassifier::classify(&rule);
                    let compiled = CompiledRule {
                        rule,
                        clickhouse_sql: None,
                        duckdb_sql: None,
                        classification,
                        source_file,
                        loaded_at: Utc::now(),
                    };
                    rule_registry.upsert(compiled);
                }
                tracing::info!(
                    count,
                    rules_dir = %rules_dir.display(),
                    "SIGMA rules loaded"
                );
            }
            Err(e) => tracing::warn!(
                error = %e,
                "failed to load SIGMA rules — continuing without rules"
            ),
        }
    } else {
        tracing::warn!(
            rules_dir = %rules_dir.display(),
            "SIGMA rules directory does not exist — continuing without rules"
        );
    }
    let rule_evaluator = Arc::new(RuleEvaluator::new(Arc::clone(&rule_registry)));

    // -----------------------------------------------------------------------
    // Step 5: Load ONNX models.
    // -----------------------------------------------------------------------
    let model_registry = Arc::new(ModelRegistry::new(models_dir.clone()));
    let inference = Arc::new(InferenceService::new(Arc::clone(&model_registry)));
    tracing::info!(models_dir = %models_dir.display(), "ONNX inference service ready");

    // -----------------------------------------------------------------------
    // Step 6: Build detection pipeline.
    // -----------------------------------------------------------------------
    let entity_graph = Arc::new(EntityGraph::new());
    let pipeline_config = PipelineConfig {
        alert_threshold,
        rules_dir,
        models_dir,
    };
    let pipeline = Arc::new(DetectionPipeline::new(
        Arc::clone(&ioc_filter),
        rule_evaluator,
        inference,
        Arc::clone(&entity_graph),
        pipeline_config,
    ));
    tracing::info!(alert_threshold, "detection pipeline ready");

    // -----------------------------------------------------------------------
    // Step 7: Start per-tenant consumer tasks.
    // -----------------------------------------------------------------------
    let shutdown = Arc::new(ShutdownHandle::new());
    let bus = AdaptiveBus::new(config.clone()).context("creating bus")?;
    let producer: Arc<dyn BusProducer> =
        Arc::from(bus.new_producer().context("creating bus producer")?);

    let mut task_handles = Vec::with_capacity(tenant_ids.len());
    for tenant_id in &tenant_ids {
        let mut consumer = bus
            .new_consumer("kron-stream")
            .context("creating bus consumer")?;

        let enriched_topic = topics::enriched_events(tenant_id);
        consumer
            .subscribe(&[enriched_topic.clone()], "kron-stream")
            .await
            .with_context(|| format!("subscribing to {enriched_topic}"))?;

        tracing::info!(
            tenant_id = %tenant_id,
            topic = %enriched_topic,
            "consumer subscribed"
        );

        let pipeline = Arc::clone(&pipeline);
        let producer = Arc::clone(&producer);
        let tenant_id = *tenant_id;
        let mut shutdown_rx = shutdown.subscribe();

        let handle = tokio::spawn(async move {
            run_consumer_loop(consumer, pipeline, producer, tenant_id, &mut shutdown_rx).await;
        });
        task_handles.push(handle);
    }

    // -----------------------------------------------------------------------
    // Step 8: Await shutdown signal.
    // -----------------------------------------------------------------------
    shutdown.listen_for_signals().await;

    // Signal the IOC refresh task to stop.
    let _ = shutdown_tx.send(true);

    // Wait for all consumer tasks to finish.
    for handle in task_handles {
        if let Err(e) = handle.await {
            tracing::error!(error = ?e, "consumer task panicked");
        }
    }

    tracing::info!("kron-stream shutdown complete");
    Ok(())
}

/// Event-processing loop for a single tenant consumer.
///
/// Polls the bus, deserialises events, runs the detection pipeline, and
/// publishes alert candidates to the alerts topic. Exits when the shutdown
/// signal fires.
async fn run_consumer_loop(
    mut consumer: Box<dyn BusConsumer>,
    pipeline: Arc<DetectionPipeline>,
    producer: Arc<dyn BusProducer>,
    tenant_id: TenantId,
    shutdown_rx: &mut tokio::sync::broadcast::Receiver<()>,
) {
    let tenant_str = tenant_id.to_string();
    let alert_topic = topics::alerts(&tenant_id);

    loop {
        tokio::select! {
            _ = shutdown_rx.recv() => {
                tracing::info!(tenant_id = %tenant_id, "consumer loop shutting down");
                break;
            }
            poll_result = consumer.poll(POLL_TIMEOUT) => {
                match poll_result {
                    Err(e) => {
                        tracing::error!(
                            tenant_id = %tenant_id,
                            error = %e,
                            "bus poll error"
                        );
                    }
                    Ok(None) => {
                        // No message within timeout — loop and poll again.
                    }
                    Ok(Some(msg)) => {
                        let start = Instant::now();

                        let event: kron_types::KronEvent =
                            match serde_json::from_slice(&msg.payload) {
                                Ok(e) => e,
                                Err(e) => {
                                    tracing::error!(
                                        tenant_id = %tenant_id,
                                        error = %e,
                                        "failed to deserialise KronEvent — nacking"
                                    );
                                    if let Err(ne) = consumer.nack(&msg, &e.to_string()).await {
                                        tracing::error!(error = %ne, "nack failed");
                                    }
                                    continue;
                                }
                            };

                        stream_metrics::record_events_processed(&tenant_str);

                        if let Some(candidate) = pipeline.process(&event).await {
                            stream_metrics::record_alerts_generated(
                                &tenant_str,
                                &candidate.severity.to_string(),
                            );

                            if candidate.ioc_hit {
                                stream_metrics::record_ioc_hits(&tenant_str);
                            }

                            for rule_match in &candidate.rule_matches {
                                stream_metrics::record_sigma_matches(
                                    &tenant_str,
                                    &rule_match.rule_id.to_string(),
                                );
                            }

                            publish_candidate(producer.as_ref(), &alert_topic, &candidate).await;
                        }

                        let elapsed_ms = u64::try_from(start.elapsed().as_millis())
                            .unwrap_or(u64::MAX);
                        stream_metrics::record_pipeline_latency_ms(elapsed_ms);

                        if let Err(e) = consumer.commit(&msg).await {
                            tracing::error!(
                                tenant_id = %tenant_id,
                                error = %e,
                                "failed to commit offset"
                            );
                        }
                    }
                }
            }
        }
    }
}

/// Serialise and publish an [`AlertCandidate`] to the alert topic.
///
/// Converts to [`AlertCandidatePayload`] before serialising. Failures are
/// logged at `error` level — a failed publish must not crash the consumer loop.
#[instrument(skip_all, fields(
    risk_score = candidate.risk_score,
    severity = %candidate.severity,
))]
async fn publish_candidate(
    producer: &dyn BusProducer,
    alert_topic: &str,
    candidate: &kron_stream::pipeline::processor::AlertCandidate,
) {
    let wire = AlertCandidatePayload::from(candidate);
    let payload = match serde_json::to_vec(&wire) {
        Ok(p) => Bytes::from(p),
        Err(e) => {
            tracing::error!(
                error = %e,
                "failed to serialise AlertCandidatePayload — alert dropped"
            );
            return;
        }
    };

    let tenant_key = Bytes::copy_from_slice(candidate.event.tenant_id.to_string().as_bytes());

    if let Err(e) = producer
        .send(alert_topic, Some(tenant_key), payload, HashMap::new())
        .await
    {
        tracing::error!(
            topic = alert_topic,
            error = %e,
            "failed to publish alert candidate"
        );
    }
}
