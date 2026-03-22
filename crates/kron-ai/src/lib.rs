//! `kron-ai` — AI/ML inference for the KRON SIEM platform.
//!
//! All inference runs locally — no external AI API calls permitted (ADR-014).
//! Data sovereignty is a hard product requirement.
//!
//! # Models
//!
//! - Anomaly scorer: Isolation Forest ONNX — `KronEvent` → score 0–1
//! - UEBA classifier: `XGBoost` ONNX — deviation features → probability 0–1
//! - Beaconing detector: FFT ONNX — inter-arrival times → score 0–1
//! - Exfil scorer: `XGBoost` ONNX — volume features → probability 0–1
//! - Multilingual summarizer: T5 ONNX 8MB (EN, HI)
//! - Mistral 7B: llama.cpp CPU (Standard), candle CUDA (Enterprise)
//!
//! # Zero-call test
//!
//! This crate has a test that verifies zero outbound HTTP calls during
//! inference. It must always pass — see `tests/integration/ai_no_outbound.rs`.
//!
//! # Module structure
//!
//! - [`onnx`] — ONNX Runtime session management and model wrappers
//! - [`mistral`] — Mistral 7B CPU and GPU backends
//! - [`language`] — multilingual alert summarizer
