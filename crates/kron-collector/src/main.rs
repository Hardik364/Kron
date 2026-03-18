//! `kron-collector` — Event intake service for the KRON SIEM platform.
//!
//! Receives events from agents and external sources, validates them,
//! and routes them to the message bus topic `kron.raw.{tenant_id}`.
//!
//! # Intake sources
//!
//! - gRPC stream from `kron-agent` (mTLS required, plaintext rejected)
//! - Syslog UDP (RFC 3164, port 514)
//! - Syslog TCP (RFC 5424, port 514 + TLS port 6514)
//! - HTTP batch: `POST /intake/v1/events`
//!
//! # Agent management
//!
//! - Registration: `POST /agents/register` (one-time token)
//! - Heartbeat: `POST /agents/heartbeat` — agent marked "dark" after 90s silence

fn main() {
    // TODO(#2, hardik, phase-1): implement collector entrypoint
    // Starts gRPC server, syslog receivers, and HTTP intake endpoint.
    // Blocked on: kron-types KronConfig, kron-bus BusProducer trait.
}
