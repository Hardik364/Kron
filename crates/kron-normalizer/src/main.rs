//! `kron-normalizer` — Event normalization service for the KRON SIEM platform.
//!
//! Consumes raw events from `kron.raw.{tenant_id}`, normalizes them to the
//! KRON canonical schema, enriches with GeoIP and asset context,
//! deduplicates, then publishes to `kron.enriched.{tenant_id}` and writes to
//! the ClickHouse `events` table.
//!
//! # Normalization pipeline
//!
//! `parse → enrich → dedup → write storage → publish enriched`
//!
//! Supported input formats: CEF, LEEF, JSON, syslog (already parsed by
//! kron-collector). Unparseable messages are nacked to the dead letter topic.
//!
//! # Usage
//!
//! ```text
//! kron-normalizer --config /etc/kron/kron.toml [--log-level debug]
//! ```

mod dedup;
mod enrich;
mod error;
mod metrics;
mod normalizer;
mod parser;
mod pipeline;
mod shutdown;
mod timestamp;

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use kron_bus::adaptive::AdaptiveBus;
use kron_storage::AdaptiveStorage;
use kron_types::KronConfig;
use tracing_subscriber::EnvFilter;

use crate::enrich::asset::AssetCache;
use crate::enrich::geoip::GeoIpLookup;
use crate::enrich::Enricher;
use crate::normalizer::Normalizer;
use crate::pipeline::Pipeline;
use crate::shutdown::ShutdownHandle;

/// Default configuration file path.
const DEFAULT_CONFIG_PATH: &str = "/etc/kron/kron.toml";

fn main() -> ExitCode {
    let args = parse_args();
    init_tracing(&args.log_level);

    let config = match KronConfig::from_file(&args.config_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("ERROR: {e}");
            return ExitCode::FAILURE;
        }
    };

    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_name("kron-normalizer")
        .build()
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("ERROR: cannot create Tokio runtime: {e}");
            return ExitCode::FAILURE;
        }
    };

    runtime.block_on(async move {
        let (shutdown, _signal_task) = ShutdownHandle::new();

        match run(config, shutdown).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                tracing::error!(error = %e, "Normalizer exited with error");
                ExitCode::FAILURE
            }
        }
    })
}

/// Builds all subsystems and runs the normalizer until shutdown.
async fn run(config: KronConfig, shutdown: ShutdownHandle) -> Result<(), error::NormalizerError> {
    let cfg = &config.normalizer;

    // Optional Prometheus metrics exporter.
    start_metrics_exporter(&cfg.metrics_addr)?;

    // GeoIP enrichment (graceful if MMDB absent).
    let geoip = GeoIpLookup::open(&cfg.geoip_db_path).map_err(error::NormalizerError::GeoIp)?;

    // Asset cache (always empty at startup in Phase 1.6).
    let assets = AssetCache::new(cfg.asset_cache_ttl(), cfg.asset_cache_size);

    let enricher = Arc::new(Enricher::new(geoip, assets));

    // Storage backend.
    let storage = AdaptiveStorage::new(&config)
        .await
        .map_err(|e| error::NormalizerError::Storage(e.to_string()))?;
    let storage: Arc<dyn kron_storage::StorageEngine> = Arc::new(storage);

    // Bus producer for publishing enriched events.
    let bus = AdaptiveBus::new(config.clone()).map_err(error::NormalizerError::Bus)?;
    let producer = Arc::new(bus.new_producer().map_err(error::NormalizerError::Bus)?)
        as Arc<dyn kron_bus::traits::BusProducer>;

    let pipeline = Arc::new(Pipeline::new(enricher, storage, producer));
    let norm = Normalizer::new(config, pipeline);

    norm.run(shutdown.subscribe()).await
}

/// Starts the Prometheus metrics HTTP exporter if `addr` is non-empty.
fn start_metrics_exporter(addr: &str) -> Result<(), error::NormalizerError> {
    if addr.is_empty() {
        return Ok(());
    }
    let addr_parsed: std::net::SocketAddr = addr.parse().map_err(|e| {
        error::NormalizerError::Config(format!("invalid metrics_addr '{addr}': {e}"))
    })?;
    metrics_exporter_prometheus::PrometheusBuilder::new()
        .with_http_listener(addr_parsed)
        .install()
        .map_err(|e| {
            error::NormalizerError::Config(format!("cannot start Prometheus exporter: {e}"))
        })?;
    tracing::info!(bind_addr = %addr, "Prometheus metrics exporter started");
    Ok(())
}

// ─── CLI argument parsing ────────────────────────────────────────────────────

/// Parsed command-line arguments.
struct Args {
    config_path: PathBuf,
    log_level: String,
}

/// Minimal CLI parser.
///
/// Supports `--config <path>`, `--log-level <level>`, `--help`, `--version`.
fn parse_args() -> Args {
    let mut config_path = PathBuf::from(DEFAULT_CONFIG_PATH);
    let mut log_level = "info".to_owned();

    let mut iter = std::env::args().skip(1);
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                println!(
                    "kron-normalizer {version}\n\
                    KRON event normalization service\n\n\
                    USAGE:\n\
                    \tkron-normalizer [OPTIONS]\n\n\
                    OPTIONS:\n\
                    \t--config <path>       Configuration file (default: {DEFAULT_CONFIG_PATH})\n\
                    \t--log-level <level>   Log level (default: info)\n\
                    \t--help, -h            Print this help\n\
                    \t--version, -v         Print version",
                    version = env!("CARGO_PKG_VERSION")
                );
                std::process::exit(0);
            }
            "--version" | "-v" => {
                println!("kron-normalizer {}", env!("CARGO_PKG_VERSION"));
                std::process::exit(0);
            }
            "--config" => {
                config_path = iter.next().map(PathBuf::from).unwrap_or_else(|| {
                    eprintln!("ERROR: --config requires a value");
                    std::process::exit(1);
                });
            }
            "--log-level" => {
                log_level = iter.next().unwrap_or_else(|| {
                    eprintln!("ERROR: --log-level requires a value");
                    std::process::exit(1);
                });
            }
            unknown => {
                eprintln!("ERROR: unknown argument: {unknown}");
                eprintln!("Run `kron-normalizer --help` for usage.");
                std::process::exit(1);
            }
        }
    }

    Args {
        config_path,
        log_level,
    }
}

// ─── Tracing initialisation ──────────────────────────────────────────────────

/// Initialises the `tracing` subscriber with structured JSON output.
fn init_tracing(log_level: &str) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(log_level));
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(filter)
        .with_current_span(true)
        .with_span_list(true)
        .init();
}
