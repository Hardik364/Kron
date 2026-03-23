//! `kron-stream` — Detection engine library for KRON SIEM.
//!
//! Provides the complete Phase 2 detection pipeline: SIGMA rule engine,
//! IOC bloom filter, ONNX inference, and the wiring that connects them.
//!
//! # Module structure
//!
//! - [`error`]    — `StreamError` enum covering all failure modes
//! - [`sigma`]    — Rule parsing, compilation, matching, registry, and evaluation
//! - [`ioc`]      — IOC counting bloom filter with background feed refresh
//! - [`pipeline`] — Composite detection pipeline (risk scoring, MITRE tagging,
//!   entity graph, and the main `DetectionPipeline`)
//! - [`shutdown`] — Graceful shutdown signal coordination
//! - [`metrics`]  — Prometheus metric helpers

pub mod error;
pub mod ioc;
pub mod metrics;
pub mod pipeline;
pub mod shutdown;
pub mod sigma;
