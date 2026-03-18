//! `kron-storage` — Storage abstraction for the KRON SIEM platform.
//!
//! Abstracts ClickHouse (Standard/Enterprise) and DuckDB (Nano) behind a
//! single [`StorageEngine`] trait. All SQL strings live in this crate — no
//! other crate may construct SQL directly (see `CLAUDE.md` prime directive 7).
//!
//! # Strict rule
//!
//! Every query, insert, and update in this crate enforces `tenant_id`.
//! The [`query::rewrite`] module injects `AND tenant_id = ?` on every
//! query — this is gate 2 of the 4-gate multi-tenancy isolation model.
//!
//! # Module structure
//!
//! - [`traits`] — `StorageEngine` trait definition
//! - [`adaptive`] — `AdaptiveStorage` picks ClickHouse or DuckDB from config
//! - [`clickhouse`] — ClickHouse implementation (Standard/Enterprise)
//! - [`duckdb`] — DuckDB implementation (Nano)
//! - [`query`] — `EventFilter`, query builder, tenant rewriter
//! - [`parquet`] — Parquet export/import for cold storage
