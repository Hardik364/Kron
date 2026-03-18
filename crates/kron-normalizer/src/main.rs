//! `kron-normalizer` — Event normalization service for the KRON SIEM platform.
//!
//! Consumes raw events from `kron.raw.{tenant_id}`, normalizes them to the
//! OCSF-aligned KRON canonical schema, enriches with GeoIP and asset context,
//! deduplicates, then publishes to `kron.enriched.{tenant_id}` and writes to
//! the ClickHouse `events` table.
//!
//! # Normalization pipeline
//!
//! `parse → map → enrich → dedup → publish`
//!
//! Supported input formats: CEF, LEEF, JSON, syslog RFC 3164, syslog RFC 5424,
//! Windows XML EventLog. Unparseable events go to `kron.deadletter` with
//! the raw content preserved.

fn main() {
    // TODO(#3, hardik, phase-1): implement normalizer entrypoint
    // Starts bus consumer, runs normalization pipeline, writes to storage.
    // Blocked on: kron-storage StorageEngine trait, kron-bus BusConsumer trait.
}
