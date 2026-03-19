# CONTEXT.md — Running Session Log

**Purpose:** Claude reads this at the start of every session to understand what happened previously.
The human updates this after each session, or Claude updates it at the end of each session.

**Rule:** Never delete entries. Only append. Old entries give context for why current code exists.

---

## How to Write a Session Entry

```markdown
## Session: YYYY-MM-DD — [What was worked on]

### Completed
- List of tasks completed (reference PHASES.md task IDs where possible)

### Decisions Made
- Any architectural decisions (add to DECISIONS.md too)

### Code Written
- Files created or significantly modified

### Known Issues / Tech Debt
- Anything not done perfectly that needs attention

### Open Questions
- Anything unresolved that needs human input

### Next Session Should Start With
- Specific instructions for the next Claude session
```

---

## Session: [Project Start] — Documentation and Architecture

### Completed
- Full product documentation created in `/docs/`
- PRD, Features, Architecture, TechStack, Database, API, Security, Deployment, AIInstructions, UIUX, Runbooks, Roadmap
- Engineering guidance files created
- Architectural decisions logged in DECISIONS.md
- Build phases defined in PHASES.md

### Decisions Made
- All ADR-001 through ADR-016 (see DECISIONS.md)
- Rust workspace with 12 crates
- DuckDB (Nano) / ClickHouse (Standard/Enterprise) tiered storage
- Redpanda / embedded channel tiered bus
- SolidJS web, Flutter mobile
- SIGMA rule engine
- ONNX + Mistral AI architecture
- No external AI calls (ADR-014)

### Code Written
- None yet — documentation phase only

### Known Issues / Tech Debt
- None (project not started)

### Open Questions
- Exact kernel version matrix for eBPF CO-RE support needs research
- Mistral 7B GGUF quantization level for CPU mode (q4_k_m vs q5_k_m) — test on target hardware
- WhatsApp Business API approval timeline in India — apply early

### Next Session Should Start With
1. Read CLAUDE.md
2. Read PHASES.md — start Phase 0
3. Initialize Rust workspace: `cargo new --name kron . --lib`
4. Create all crate directories under `crates/`
5. Set up `rustfmt.toml`, `clippy.toml`, `.cargo/config.toml`
6. First task: Phase 0 — Repository & Tooling

---

## Session: 2026-03-18 — Phase 0: Repository & Tooling Setup

### Completed
- Initialized git repository, connected to https://github.com/Hardik364/Kron.git
- Created root Cargo.toml with all 14 workspace members and full dependency table
- Set up rustfmt.toml, clippy.toml, deny.toml, .cargo/config.toml, .gitignore
- Created all 14 crate skeletons (5 library + 9 binary) with correct deps, workspace lints, doc comments
- Created GitHub Actions CI pipeline (ci.yml) — 7 jobs including integration tests
- Created QA workflow (qa.yml) — Docker images to GHCR on push to main
- Created Release workflow (release.yml) — musl binaries + cosign signing on tag v*
- Created .pre-commit-config.yaml (cargo-fmt, cargo-clippy, gitleaks v8.18.4)
- Created docker-compose.dev.yml with all 5 services (health checks + named volumes)
- Created docker-compose.qa.yml (minimal CI compose reference)
- Created 4 dev scripts: dev-up.sh, dev-down.sh, dev-reset.sh, dev-health-check.sh
- Created 9 service Dockerfiles (multi-stage, non-root kron user)
- Tagged v0.0.1 — first skeleton release

### Decisions Made
- Two environments: `qa` (auto on push to main) and `production` (manual approval on tag v*)
- .cargo/config.toml mold linker Linux-only — avoids Windows build failure on dev machine
- Rust not installed locally on developer machine — CI (ubuntu-latest) validates compilation
- kron-auth is a library crate, not a binary — auth logic embedded in kron-query-api

### Known Issues
- Rust toolchain not installed locally (Windows) — install via rustup.rs before Phase 1
- GitHub Environments (qa, production) must be created manually — see .github/ENVIRONMENTS.md
- COSIGN_PRIVATE_KEY + COSIGN_PASSWORD secrets must be added to production environment
- Dev environment smoke test (docker-compose up + health check) pending manual verification

### Open Questions
- Exact kernel version matrix for eBPF CO-RE (carried from project start)
- Mistral 7B GGUF quantization level (q4_k_m vs q5_k_m) for CPU Standard tier
- WhatsApp Business API approval timeline in India

### Next Session Should Start With
1. Read CLAUDE.md, PHASES.md, this CONTEXT.md
2. Phase: 1.1 — implement kron-types (TenantId, EventId, AlertId, KronEvent, KronAlert, etc.)
3. Install Rust first: https://rustup.rs/ — run `cargo build --workspace` locally to verify
4. Set up GitHub Environments per .github/ENVIRONMENTS.md

---

## Session: 2026-03-19 — Phase 1.1 Complete + Phase 1.2 Storage Layer Foundation

### Completed
- **Phase 1.1 (kron-types):** All 13 tasks marked complete and verified
  - Compiled successfully with `cargo check -p kron-types`
  - Code pushed in commit 25a9df9 (4,475 lines, 7 modules)

- **Phase 1.2 (kron-storage) Storage Layer Scaffold:**
  - Implemented `StorageEngine` trait (async-aware via `async_trait`)
  - Defined `EventFilter` with builder pattern and serialization
  - Created `QueryBuilder` for parameterized, tenant-isolated queries
  - Implemented `AdaptiveStorage` selector (chooses DuckDB or ClickHouse from `DeploymentMode`)
  - Created `DuckDbEngine` stub for Nano tier
  - Created `ClickHouseEngine` stub for Standard/Enterprise tier
  - All operations enforce `tenant_id` isolation (gate 2 of 4-gate model)
  - Added structured logging with `tracing` spans on all methods
  - Entire workspace compiles cleanly

### Decisions Made
- `StorageEngine` trait uses `async_trait` for dynamic dispatch (enables `AdaptiveStorage` enum pattern)
- Tenant isolation enforced via `TenantIsolationViolation` error with caller/target context
- `QueryBuilder` always injects `AND tenant_id = ?` on every query
- `EventFilter` fields are optional; empty filter matches "all events for tenant"
- `AdaptiveStorage` uses Arc-wrapped backends to support dynamic dispatch across match arms
- `DeploymentMode` added to kron-types re-exports (public API)
- Stubs have TODO comments with issue placeholders: `TODO(#TBD, hardik, v1.1): ...`

### Code Written
- `crates/kron-storage/src/traits.rs` — `StorageEngine` trait, `AuditLogEntry`, `LatencyStats`
- `crates/kron-storage/src/query.rs` — `EventFilter`, `QueryBuilder`, `QueryParam`, unit tests
- `crates/kron-storage/src/adaptive.rs` — `AdaptiveStorage` with mode-based backend selection
- `crates/kron-storage/src/duckdb.rs` — `DuckDbEngine` with stub implementations
- `crates/kron-storage/src/clickhouse.rs` — `ClickHouseEngine` with stub implementations
- Modified: `crates/kron-storage/src/lib.rs` — module declarations, re-exports
- Modified: `crates/kron-storage/Cargo.toml` — added `serde`, `chrono`, `tracing` deps
- Modified: `crates/kron-types/src/lib.rs` — added `DeploymentMode` to re-exports
- Modified: `PHASES.md` — marked all Phase 1.1 tasks complete, Phase 1.2 in-progress

### Known Issues / Tech Debt
- DuckDB and ClickHouse backends are stubs: no actual DB connections, queries, or migrations yet
- QueryBuilder only has SELECT templates for events/alerts; INSERT/UPDATE stubs need full schemas
- No connection pooling, retry logic, or circuit breaker implementation yet (TODOs exist)
- Latency stats always return zeros (no instrumentation yet)
- Health checks are no-ops
- 2 warnings: unused struct fields `url`, `database` in ClickHouseEngine; `db_path` in DuckDbEngine
  (Expected; will be used when actual DB code is added)

### Open Questions
- Should `EventFilter` support complex boolean logic (AND/OR between conditions)?
  Currently all filters are ANDed together. Complex queries should probably go through raw_where_clause or a separate interface.
- Connection pool size, timeout values, and retry backoff strategy — need to decide before implementing real DB code
- Pagination: should `query_events` support limit/offset, or just limit? Current impl has only limit
- Audit log merkle chain — need to decide on hashing algorithm and verification strategy

### Next Session Should Start With
1. Read CLAUDE.md, PHASES.md, CONTEXT.md
2. **Phase 1.2 continued:** Implement actual database drivers
   - Add `duckdb` crate to Cargo.toml, implement DuckDB connection + migrations
   - Add `reqwest` + response parsing to ClickHouseEngine for HTTP API
   - Implement `insert_events()` and `query_events()` with full schema mapping
   - Write integration tests using testcontainers (DuckDB file, ClickHouse container)
3. Next priority: Phase 1.3 (kron-bus) — message bus abstraction
4. Consider: Update DECISIONS.md with ADR-017 (Storage layer design choices)

---

## Session: 2026-03-19 — Phase 1.2 Storage Layer Complete

### Completed
- **Phase 1.2 (kron-storage):** All 13 tasks complete, `cargo check -p kron-storage` passes clean
  - Full `ClickHouseEngine`: HTTP client, circuit breaker, exponential backoff retry, Merkle-chained audit log, 60+ field event/alert row mapping, Prometheus counters
  - Full `DuckDbEngine`: real DuckDB connection via mutex, all CRUD operations, migration runner with SHA256 checksums
  - `AdaptiveStorage`: selects engine from `DeploymentMode` in config
  - `migration.rs`: idempotent SQL runner, filters `*_ch.sql` vs `*_duck.sql` by backend
  - 4 ClickHouse migration files: `000_schema_versions_ch.sql`, `001_create_events_ch.sql`, `002_create_alerts_ch.sql`, `003_create_audit_log_ch.sql`
  - `EventId`, `AlertId`, `RuleId` now implement `FromStr` (was missing from kron-types)
  - `ClickHouseConfig`, `DuckDbConfig` re-exported at `kron_types` crate root

### Decisions Made
- ClickHouse HTTP client uses internal connection pool (no deadpool needed — clickhouse crate handles pooling)
- `CXXFLAGS = "-include cstdint"` in `.cargo/config.toml` to fix bundled DuckDB 0.10 source with GCC 15
- `chrono` pinned to `< 0.4.38` to avoid `Datelike::quarter()` ambiguity with `arrow-arith v51` (unpin when duckdb upgraded past 0.10)
- MSYS2 MinGW64 toolchain at `C:\tools\msys64\mingw64\bin` required in PATH for Windows GNU Rust builds

### Known Issues / Tech Debt
- Integration tests not yet run (require running ClickHouse and DuckDB containers) — Phase 1.2 acceptance criteria pending
- `query_timeout` / `insert_timeout` fields stored in `ClickHouseEngine` but not yet wired to per-query client calls
- `chrono` upper-bound and `CXXFLAGS` hack must be removed when `duckdb` crate is upgraded past 0.10

### Open Questions
- ClickHouse deadpool connection pooling was deferred (clickhouse crate has built-in pool) — is this sufficient for 50K EPS?
- Integration test suite: should it use testcontainers or a fixed dev-compose instance?

### Next Session Should Start With
1. Read CLAUDE.md, PHASES.md, CONTEXT.md
2. **Phase 1.3 (kron-bus):** Implement `BusProducer` / `BusConsumer` traits + embedded channel (Nano tier) + Redpanda (Standard/Enterprise)
3. Add `C:\tools\msys64\mingw64\bin` to Windows system PATH permanently so it persists across terminals

---

## Session: 2026-03-19 — Phase 1.3 Message Bus (kron-bus) Complete

### Completed
- **Phase 1.3 (kron-bus):** All 11 tasks marked complete
  - `BusProducer` + `BusConsumer` traits with full doc comments and at-least-once semantics
  - `BusMessage` + `OutboundMessage` value types
  - `EmbeddedBusProducer` / `EmbeddedBusConsumer`: disk-backed WAL for Nano tier
  - `Wal`: append-only binary file with xxhash3 checksums, crash recovery, compaction
  - `EmbeddedBusState`: shared topic registry + global Notify for wakeup
  - `RedpandaProducer` / `RedpandaConsumer`: rdkafka wrappers with DLQ routing
  - `AdaptiveBus`: factory selecting embedded vs Redpanda from `KronConfig.mode`
  - `topics.rs`: all topic name constants + per-tenant helpers
  - `metrics.rs`: Prometheus metrics (sent, received, commits, nacks, DLQ, lag, latency)
  - Added `EmbeddedBusConfig` to `kron-types/src/config.rs`
  - Dead letter queue: messages routed after `max_retry_count` (default 3) nacks
  - Backpressure: producer returns `BusError::Backpressure` when lag > threshold

### Decisions Made
- At-least-once delivery via explicit offset commits (not auto-commit)
- Dead letter topic naming: `kron.deadletter.{source_topic}`
- Embedded bus uses `tokio::task::spawn_blocking` for all WAL I/O (no blocking in async runtime)
- WAL format: binary with xxhash3_64 checksum per record, 16-byte file header ("KRONWLOG")
- `EmbeddedBusState` shared via `Arc` between all producers and consumers in same process
- `TopicRegistry` uses `std::sync::Mutex` (not tokio) since it's only accessed inside spawn_blocking
- Compaction triggered manually via `Wal::compact(min_offset)` — no automatic background task
- Redpanda consumer creates DLQ producer on construction for independent DLQ routing

### Code Written
- `crates/kron-bus/src/lib.rs` — module declarations + top-level doc
- `crates/kron-bus/src/error.rs` — `BusError` with 9 variants
- `crates/kron-bus/src/traits.rs` — `BusProducer`, `BusConsumer`, `BusMessage`, `OutboundMessage`
- `crates/kron-bus/src/topics.rs` — topic constants and helpers (with unit tests)
- `crates/kron-bus/src/metrics.rs` — Prometheus metric recording functions
- `crates/kron-bus/src/embedded/wal.rs` — Write-ahead log implementation (with unit tests)
- `crates/kron-bus/src/embedded/state.rs` — `EmbeddedBusState`, `TopicRegistry`, `TopicEntry`
- `crates/kron-bus/src/embedded/producer.rs` — `EmbeddedBusProducer`
- `crates/kron-bus/src/embedded/consumer.rs` — `EmbeddedBusConsumer` with retry + DLQ
- `crates/kron-bus/src/embedded/mod.rs` — re-exports
- `crates/kron-bus/src/redpanda/producer.rs` — `RedpandaProducer` (rdkafka FutureProducer)
- `crates/kron-bus/src/redpanda/consumer.rs` — `RedpandaConsumer` (rdkafka StreamConsumer)
- `crates/kron-bus/src/redpanda/mod.rs` — re-exports
- `crates/kron-bus/src/adaptive.rs` — `AdaptiveBus` factory
- `crates/kron-types/src/config.rs` — added `EmbeddedBusConfig` + updated `KronConfig`
- Modified: `crates/kron-bus/Cargo.toml` — added all required dependencies
- Modified: `crates/kron-types/src/lib.rs` — added `EmbeddedBusConfig`, `RedpandaConfig` to re-exports

### Known Issues / Tech Debt
- Redpanda consumer tests require a running Redpanda broker (integration tests only)
- WAL compaction is not triggered automatically — callers must invoke it periodically
- `EmbeddedBusConsumer::try_read_next` iterates topics sequentially, not round-robin
- `chrono::DateTime::from_timestamp_millis` may return None for out-of-range timestamps (handled with fallback to Utc::now)

### Open Questions
- WAL segment rotation (multiple segment files per topic) — needed when WAL > 256MB sustained
- Redpanda TLS/SASL configuration — `KronConfig.redpanda` needs `ssl_ca_location`, `sasl_mechanism` fields for production

### Next Session Should Start With
1. Read CLAUDE.md, PHASES.md, CONTEXT.md
2. **Phase 1.4 (kron-agent):** eBPF agent implementation
   - Note: requires Linux kernel 5.4+ with BTF — CI will validate, not local Windows dev
3. Run `cargo check --workspace` to verify Phase 1.3 compiles cleanly
