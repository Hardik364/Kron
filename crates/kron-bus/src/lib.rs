//! `kron-bus` — Message bus abstraction for the KRON SIEM platform.
//!
//! Abstracts Redpanda (Standard/Enterprise) and an embedded disk-backed
//! async channel (Nano) behind [`BusProducer`] and [`BusConsumer`] traits.
//!
//! # Topics
//!
//! - `kron.raw.{tenant_id}` — raw events from collectors
//! - `kron.enriched.{tenant_id}` — normalized and enriched events
//! - `kron.alerts.{tenant_id}` — alert candidates from stream processor
//! - `kron.audit` — immutable audit log entries
//!
//! # Delivery guarantee
//!
//! At-least-once delivery. Consumers commit offsets only after successful
//! processing. Failed messages go to `kron.deadletter` after 3 retries.
//!
//! # Module structure
//!
//! - [`traits`] — `BusProducer`, `BusConsumer` trait definitions
//! - [`topics`] — `Topic` enum and topic name constants
//! - [`adaptive`] — `AdaptiveBus` selects implementation from config
//! - [`embedded`] — disk-backed async channel for Nano tier
//! - [`redpanda`] — rdkafka wrapper for Standard/Enterprise
