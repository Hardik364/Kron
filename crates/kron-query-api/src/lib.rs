//! `kron-query-api` library root.
//!
//! Exposes the full Axum REST and WebSocket API surface for the KRON SIEM
//! platform. The binary (`main.rs`) bootstraps infrastructure and calls
//! [`routes::build_router`] to obtain the router, then serves it.
//!
//! # Module structure
//!
//! - [`error`]      — `ApiError` enum with `IntoResponse` impl
//! - [`state`]      — `AppState` shared across all handlers
//! - [`middleware`] — JWT `AuthUser` extractor and auth layer
//! - [`routes`]     — Router construction
//! - [`handlers`]   — One sub-module per resource group
//! - [`ws`]         — WebSocket upgrade handlers

pub mod error;
pub mod handlers;
pub mod middleware;
pub mod routes;
pub mod state;
pub mod ws;
