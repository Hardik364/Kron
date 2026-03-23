//! `kron-query-api` binary entrypoint.
//!
//! Loads configuration, initialises all shared services, starts the Axum server
//! with graceful shutdown, and spawns a background task to evict expired JWT
//! revocations and brute-force records.
//!
//! # Startup sequence
//!
//! 1. Parse tracing/log configuration from `config.telemetry`.
//! 2. Load [`KronConfig`] from the path in `KRON_CONFIG` env var (or default).
//! 3. Initialise [`kron_storage::AdaptiveStorage`].
//! 4. Load RSA key pair and build [`crate::state::JwtService`].
//! 5. Build [`AppState`] and wire the Axum router via [`routes::build_router`].
//! 6. Bind TCP listener and serve with graceful shutdown on SIGINT / SIGTERM.

use std::{net::SocketAddr, sync::Arc, time::Duration};

use anyhow::Context;
use tokio::signal;
use tracing::info;

use kron_query_api::{
    routes::build_router,
    state::{AppState, BruteForceGuard, JwtService, SessionBlocklist},
};
use kron_storage::AdaptiveStorage;
use kron_types::KronConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ── 1. Tracing ────────────────────────────────────────────────────────────
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .json()
        .init();

    // ── 2. Configuration ──────────────────────────────────────────────────────
    let config_path =
        std::env::var("KRON_CONFIG").unwrap_or_else(|_| "/etc/kron/kron.toml".to_owned());

    let config = KronConfig::from_file(std::path::Path::new(&config_path))
        .with_context(|| format!("Failed to load config from '{config_path}'"))?;
    let config = Arc::new(config);

    info!(config_path = %config_path, mode = ?config.mode, "Configuration loaded");

    // ── 3. Storage ────────────────────────────────────────────────────────────
    let storage = AdaptiveStorage::new(&config)
        .await
        .context("Failed to initialise storage backend")?;
    let storage = Arc::new(storage);

    info!(backend = %storage.backend_name(), "Storage backend initialised");

    // ── 4. JWT service ────────────────────────────────────────────────────────
    let private_pem = std::fs::read(&config.auth.jwt_private_key_path).with_context(|| {
        format!(
            "Cannot read JWT private key from '{}'",
            config.auth.jwt_private_key_path.display()
        )
    })?;

    let public_pem = std::fs::read(&config.auth.jwt_public_key_path).with_context(|| {
        format!(
            "Cannot read JWT public key from '{}'",
            config.auth.jwt_public_key_path.display()
        )
    })?;

    let jwt_service = JwtService::from_pem(&private_pem, &public_pem, config.auth.jwt_expiry_secs)
        .map_err(|e| anyhow::anyhow!("Failed to initialise JwtService: {e}"))?;
    let jwt_service = Arc::new(jwt_service);

    // ── 5. Auth guards ────────────────────────────────────────────────────────
    let blocklist = Arc::new(SessionBlocklist::new());
    let brute_force = Arc::new(BruteForceGuard::new(
        config.auth.max_failed_attempts as u8,
        config.auth.lockout_duration_secs,
    ));

    // Background task: evict expired blocklist entries and brute-force records.
    {
        let bl = Arc::clone(&blocklist);
        let bf = Arc::clone(&brute_force);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(300));
            loop {
                tick.tick().await;
                bl.evict_expired();
                bf.evict_expired();
                tracing::debug!("Evicted expired auth guard entries");
            }
        });
    }

    // ── 6. Bus producer ───────────────────────────────────────────────────────
    // The query API does not produce bus messages today (WS fanout is a Phase 3
    // feature). We still wire the bus so AppState is complete and the field is
    // available for future handlers without an API-breaking change.
    let bus_producer: Arc<dyn kron_bus::BusProducer + Send + Sync> = {
        let adaptive =
            kron_bus::AdaptiveBus::new((*config).clone()).context("Failed to initialise bus")?;
        let producer = adaptive
            .new_producer()
            .context("Failed to create bus producer")?;
        Arc::from(producer)
    };

    // ── 7. App state + router ─────────────────────────────────────────────────
    let state = AppState {
        storage,
        bus: bus_producer,
        jwt: jwt_service,
        brute_force,
        blocklist,
        config: Arc::clone(&config),
    };

    let app = build_router(state);

    // ── 8. Bind and serve ─────────────────────────────────────────────────────
    let addr: SocketAddr = config
        .api
        .listen_addr
        .parse()
        .with_context(|| format!("Invalid api.listen_addr: '{}'", config.api.listen_addr))?;

    info!(address = %addr, "kron-query-api listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("Cannot bind to {addr}"))?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("Server error")?;

    info!("kron-query-api shutdown complete");
    Ok(())
}

/// Waits for SIGINT (Ctrl-C) or SIGTERM and returns.
///
/// Used as the graceful-shutdown future passed to [`axum::serve`].
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .unwrap_or_else(|e| tracing::error!(error = %e, "failed to listen for Ctrl-C"));
    };

    #[cfg(unix)]
    let terminate = async {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(e) => {
                tracing::error!(error = %e, "failed to install SIGTERM handler");
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }

    info!("Shutdown signal received, draining connections");
}
