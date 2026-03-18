//! `kron-query-api` — REST and WebSocket API server for the KRON SIEM platform.
//!
//! The outermost service. Depends on all other `kron-*` crates. Serves the
//! SolidJS frontend and exposes all API endpoints documented in `docs/API.md`.
//!
//! # Multi-tenancy isolation (gate 2)
//!
//! Every request goes through the query rewrite middleware which injects
//! `tenant_id` into all storage queries. Combined with JWT validation (gate 1),
//! ClickHouse row-level security (gate 3), and continuous canary tests (gate 4),
//! this ensures complete tenant data isolation.
//!
//! # API surface
//!
//! - `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
//! - `GET /events`, `GET /events/{id}`
//! - `GET /alerts`, `GET /alerts/{id}`, `PATCH /alerts/{id}`
//! - `GET /rules`, `POST /rules`, `PUT /rules/{id}`, `DELETE /rules/{id}`
//! - `GET /assets`, `POST /assets`
//! - `GET /playbooks`, `POST /playbooks/{id}/execute`
//! - `GET /compliance/report`
//! - `WS /ws/alerts`, `WS /ws/events`
//! - `GET /health`, `GET /metrics`, `GET /version`

fn main() {
    // TODO(#8, hardik, phase-3): implement API server entrypoint
    // Blocked on: kron-auth (Phase 3), all service crates (Phase 1-2).
}
