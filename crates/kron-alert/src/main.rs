//! `kron-alert` — Alert engine for the KRON SIEM platform.
//!
//! Assembles, deduplicates, and delivers alerts to analysts via WhatsApp
//! (primary), SMS (fallback), and email (secondary fallback).
//!
//! # Alert pipeline
//!
//! 1. Consume alert candidates from stream processor
//! 2. Deduplicate: group by `(rule_id + affected_asset + 15-min window)`
//! 3. Assemble `KronAlert` with evidence event IDs
//! 4. Generate plain-language EN/HI narrative
//! 5. Deliver via WhatsApp Business API with action buttons (Block/Isolate/Ignore/Escalate)
//! 6. Parse analyst reply → trigger SOAR action
//!
//! # Notification rate limits
//!
//! P1/P2: always immediate. P3+: max 10/hour (excess queued for next hour).

fn main() {
    // TODO(#5, hardik, phase-2): implement alert engine entrypoint
    // Blocked on: kron-stream stream processor (Phase 2).
}
