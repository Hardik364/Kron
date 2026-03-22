//! `kron-stream` — Detection engine library for KRON SIEM.
//!
//! Provides the SIGMA rule engine used by the stream processor binary.
//! The engine parses SIGMA YAML rules, compiles them to SQL for batch
//! queries, and evaluates them in-memory for real-time stream detection.
//!
//! # Module structure
//!
//! - [`error`] — `StreamError` enum covering all failure modes
//! - [`sigma`] — Rule parsing, compilation, matching, registry, and evaluation

pub mod error;
pub mod sigma;
