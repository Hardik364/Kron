//! `kron-types` — Shared types for the KRON SIEM platform.
//!
//! This crate is the foundation of the workspace. It contains all shared
//! data types, error enums, and configuration structs used by every other
//! `kron-*` crate. It has zero internal dependencies.
//!
//! # Module structure
//!
//! - [`ids`] — `TenantId`, `EventId`, `AlertId`, `RuleId` newtypes
//! - [`event`] — `KronEvent` canonical event schema
//! - [`alert`] — `KronAlert` struct
//! - [`enums`] — `Severity`, `EventSource`, `EventCategory`, `AssetCriticality`
//! - [`config`] — `KronConfig` full configuration tree
//! - [`error`] — `KronError` top-level error enum
//! - [`context`] — `TenantContext` request-scoped tenant holder
