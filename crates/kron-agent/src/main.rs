//! `kron-agent` — eBPF/ETW collection agent for the KRON SIEM platform.
//!
//! Deployed on monitored Linux (eBPF) and Windows (ETW) endpoints.
//! Captures process creation, network connections, file access, and
//! authentication events and streams them to `kron-collector` via gRPC mTLS.
//!
//! # Key properties
//!
//! - CO-RE: BTF-based, compiles once, runs on kernel 5.4+
//! - Static binary: < 20MB, no runtime dependencies
//! - Local disk buffer (LevelDB): survives collector outages up to 1GB
//! - CPU overhead: < 1% on idle system; memory: < 50MB RSS
//!
//! # eBPF safety
//!
//! `unsafe` code is permitted in the [`ebpf`] module only, required for aya
//! eBPF map access and ring buffer operations. All unsafe blocks carry a
//! safety comment explaining the invariants that make them sound.

fn main() {
    // TODO(#1, hardik, phase-1): implement agent entrypoint
    // Loads AgentConfig, initializes tracing, starts eBPF programs and gRPC sender.
    // Blocked on: kron-types AgentConfig, kron-bus BusProducer trait.
}
