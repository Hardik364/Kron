//! Health and version endpoints.
//!
//! These endpoints are public (no JWT required) and are used by Kubernetes
//! liveness/readiness probes and the KRON deployment health dashboard.

use axum::{extract::State, Json};
use serde::Serialize;

use crate::state::AppState;

/// Response body for `GET /api/v1/health`.
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    /// Overall status of the API server.
    pub status: &'static str,
    /// Status of the storage backend.
    pub storage: &'static str,
}

/// Response body for `GET /api/v1/version`.
#[derive(Debug, Serialize)]
pub struct VersionResponse {
    /// Semantic version of this build (from `Cargo.toml`).
    pub version: &'static str,
    /// Git commit SHA injected at build time via `GIT_COMMIT` env var.
    pub commit: &'static str,
}

/// `GET /api/v1/health` — liveness check.
///
/// Returns 200 immediately if the API server process is running. Does not
/// check downstream dependencies — use the dedicated readiness probe for that.
///
/// # Returns
///
/// Always `200 OK` with `{"status":"ok","storage":"ok"}`.
pub async fn health(_state: State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        storage: "ok",
    })
}

/// `GET /api/v1/version` — build information.
///
/// Returns the crate version and the git commit SHA embedded at build time.
/// Useful for verifying which build is deployed without SSHing into the node.
pub async fn version() -> Json<VersionResponse> {
    Json(VersionResponse {
        version: env!("CARGO_PKG_VERSION"),
        commit: option_env!("GIT_COMMIT").unwrap_or("unknown"),
    })
}
