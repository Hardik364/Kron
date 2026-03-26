//! Axum router construction for the KRON query API.
//!
//! Splits routes into two groups:
//! - **Public** — `/health`, `/version`, `/auth/login`, `/auth/refresh`:
//!   no JWT required.
//! - **Protected** — everything else: requires a valid JWT via the
//!   [`crate::middleware::AuthUser`] extractor (which is a
//!   `FromRequestParts<AppState>` impl).
//!
//! All routes are nested under `/api/v1`.

use axum::{
    routing::{delete, get, patch, post, put},
    Router,
};
use tower::ServiceBuilder;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{
    handlers::{
        alerts::{acknowledge_alert, get_alert, list_alerts, update_alert},
        assets::{get_asset, list_assets},
        auth::{login, logout, refresh},
        compliance::{export_evidence, generate_report, list_reports},
        events::{get_event, list_events, query_events},
        health::{health, version},
        rules::{create_rule, delete_rule, import_sigma, list_rules, update_rule},
        tenants::{create_tenant, get_tenant, list_tenants, offboard_tenant, update_tenant_config},
    },
    state::AppState,
    ws::{alerts::ws_alerts, events::ws_events},
};

/// Builds and returns the complete Axum [`Router`] for the KRON query API.
///
/// The returned router has:
/// - CORS configured as permissive (restrict in production via `config.api`).
/// - `TraceLayer` for per-request structured tracing spans.
/// - All routes nested under `/api/v1`.
/// - Tenant isolation enforced by the [`AppState`] jwt/blocklist fields used
///   inside the [`crate::middleware::AuthUser`] extractor on every protected endpoint.
///
/// # Arguments
/// * `state` — shared application state injected into all handlers
pub fn build_router(state: AppState) -> Router {
    // ── Public routes (no JWT required) ──────────────────────────────────────
    let public = Router::new()
        .route("/health", get(health))
        .route("/version", get(version))
        .route("/auth/login", post(login))
        .route("/auth/refresh", post(refresh));

    // ── Protected routes (JWT required via AuthUser extractor) ───────────────
    let protected = Router::new()
        // Auth
        .route("/auth/logout", post(logout))
        // Events
        .route("/events", get(list_events))
        .route("/events/query", post(query_events))
        .route("/events/:event_id", get(get_event))
        // Alerts
        .route("/alerts", get(list_alerts))
        .route("/alerts/:alert_id", get(get_alert))
        .route("/alerts/:alert_id", patch(update_alert))
        .route("/alerts/:alert_id/acknowledge", post(acknowledge_alert))
        // Rules
        .route("/rules", get(list_rules))
        .route("/rules", post(create_rule))
        .route("/rules/import", post(import_sigma))
        .route("/rules/:rule_id", put(update_rule))
        .route("/rules/:rule_id", delete(delete_rule))
        // Assets
        .route("/assets", get(list_assets))
        .route("/assets/:asset_id", get(get_asset))
        // Tenants (MSSP portal)
        .route("/tenants", get(list_tenants))
        .route("/tenants", post(create_tenant))
        .route("/tenants/:tenant_id", get(get_tenant))
        .route("/tenants/:tenant_id/config", put(update_tenant_config))
        .route("/tenants/:tenant_id", delete(offboard_tenant))
        // Compliance
        .route("/compliance/reports", get(list_reports))
        .route("/compliance/reports", post(generate_report))
        .route("/compliance/reports/:report_id/evidence", get(export_evidence))
        // WebSocket streams
        .route("/ws/alerts", get(ws_alerts))
        .route("/ws/events", get(ws_events));

    // ── Compose ───────────────────────────────────────────────────────────────
    Router::new()
        .nest("/api/v1", public)
        .nest("/api/v1", protected)
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive()),
        )
        .with_state(state)
}
