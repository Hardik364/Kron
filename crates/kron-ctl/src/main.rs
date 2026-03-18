//! `kron-ctl` — CLI management tool for the KRON SIEM platform.
//!
//! Distributed as a static binary on both server and admin workstations.
//! Used for operations, diagnostics, and initial setup.
//!
//! # Commands
//!
//! - `kron-ctl health` — check all services
//! - `kron-ctl events query --tenant X --from Y --to Z --limit N`
//! - `kron-ctl events tail --tenant X` — live tail
//! - `kron-ctl agents list` — show registered agents and heartbeat status
//! - `kron-ctl agent-token create` — generate agent registration token
//! - `kron-ctl storage stats` — ClickHouse storage usage
//! - `kron-ctl migration run` — apply pending SQL migrations
//! - `kron-ctl migration status` — show migration state
//! - `kron-ctl tenant-create`, `tenant-list`, `tenant-delete`
//! - `kron-ctl compliance report --framework cert-in --from X --to Y`

fn main() {
    // TODO(#9, hardik, phase-1): implement kron-ctl command dispatcher
    // Blocked on: kron-storage StorageEngine (Phase 1).
}
