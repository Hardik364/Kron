//! `kron-alert` — Alert engine for the KRON SIEM platform.
//!
//! Assembles, deduplicates, and delivers alerts to analysts via `WhatsApp`
//! (primary), SMS (fallback), and email (secondary fallback).
//!
//! # Alert pipeline
//!
//! 1. Consume alert candidates from stream processor
//! 2. Deduplicate: group by `(rule_id + affected_asset + 15-min window)`
//! 3. Assemble `KronAlert` with evidence event IDs
//! 4. Generate plain-language EN/HI narrative
//! 5. Deliver via `WhatsApp` Business API with fallback to SMS, then email
//!
//! # Notification rate limits
//!
//! P1/P2: always immediate. P3+: max 10/hour (excess rate-limited).

mod assembler;
mod dedup;
mod engine;
mod error;
mod metrics;
mod narrative;
mod notify;
mod types;

use std::sync::Arc;

use anyhow::Context;
use kron_bus::topics;
use kron_bus::AdaptiveBus;
use kron_storage::AdaptiveStorage;
use kron_types::KronConfig;
use tokio::sync::broadcast;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Initialise structured tracing.
    let config_path =
        std::env::var("KRON_CONFIG").unwrap_or_else(|_| "/etc/kron/kron.toml".to_string());

    // Bootstrap tracing early so config load errors are visible.
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .json()
        .init();

    tracing::info!(config = %config_path, "kron-alert starting");

    // 2. Load KronConfig.
    let config = KronConfig::from_file(std::path::Path::new(&config_path))
        .context("failed to load KronConfig")?;

    // 3. Build AdaptiveStorage.
    let storage = AdaptiveStorage::new(&config)
        .await
        .context("failed to initialise storage")?;
    let storage = Arc::new(storage);

    // 4. Build AdaptiveBus + consumer for each tenant.
    let bus = AdaptiveBus::new(config.clone()).context("failed to initialise message bus")?;

    let mut consumer = bus
        .new_consumer("kron-alert")
        .context("failed to create bus consumer")?;

    // Subscribe to alert-candidates topics for all configured tenants.
    let alert_topics: Vec<String> = config
        .normalizer
        .raw_tenant_ids
        .iter()
        .filter_map(|s| s.parse::<kron_types::TenantId>().ok())
        .map(|tid| topics::alerts(&tid))
        .collect();

    if alert_topics.is_empty() {
        tracing::warn!(
            "No tenant IDs configured in normalizer.raw_tenant_ids — \
             alert engine will not consume any topics"
        );
    } else {
        consumer
            .subscribe(&alert_topics, "kron-alert-group")
            .await
            .context("failed to subscribe to alert topics")?;
        tracing::info!(topics = ?alert_topics, "Subscribed to alert-candidate topics");
    }

    // 5. Build AlertEngine.
    let engine = engine::AlertEngine::new(&config, Arc::clone(&storage), &bus)
        .context("failed to create alert engine")?;
    let engine = Arc::new(engine);

    // 6. Register shutdown handler.
    let (shutdown_tx, shutdown_rx) = broadcast::channel::<()>(1);

    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            tracing::info!("Received SIGINT — initiating shutdown");
            let _ = shutdown_tx.send(());
        }
    });

    // 7. Run until shutdown.
    engine
        .run(consumer, shutdown_rx)
        .await
        .context("alert engine exited with error")?;

    tracing::info!("kron-alert shutdown complete");
    Ok(())
}
