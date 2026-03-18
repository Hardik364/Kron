//! `kron-stream` — Stream detection engine for the KRON SIEM platform.
//!
//! Consumes enriched events from `kron.enriched.{tenant_id}` and runs the
//! full detection pipeline: IOC bloom filter → SIGMA rule evaluation →
//! ONNX anomaly scoring → UEBA deviation → entity graph → risk score →
//! MITRE ATT&CK tagging. Events above threshold are published to `kron-alert`.
//!
//! # Detection pipeline (per event, in order)
//!
//! 1. IOC bloom filter check (< 1ms)
//! 2. SIGMA rule evaluation (compiled SQL)
//! 3. ONNX anomaly scoring (`spawn_blocking`, does not block stream)
//! 4. UEBA deviation computation
//! 5. Entity graph update
//! 6. Composite risk score
//! 7. MITRE ATT&CK tagging
//!
//! Target throughput: > 10,000 events/sec on Standard-tier hardware.

fn main() {
    // TODO(#4, hardik, phase-2): implement stream processor entrypoint
    // Starts bus consumer, runs detection pipeline, publishes alert candidates.
    // Blocked on: kron-stream SIGMA engine (Phase 2).
}
