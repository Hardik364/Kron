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


---

## Session: 2026-03-22 — Phase 1.5 Collector (kron-collector) Complete

### Completed
- **Phase 1.5 (kron-collector):** All 10 tasks implemented, `cargo check -p kron-collector` passes clean
  - `error.rs`: `CollectorError` enum (9 variants, thiserror)
  - `metrics.rs`: Prometheus functions for events received/published/rejected, agent registration/dark, heartbeat, rate-limited, batch size, publish latency
  - `shutdown.rs`: `ShutdownHandle` with broadcast channel + Ctrl-C signal listener
  - `codec.rs`: Server-side JSON codec mirroring agent's codec — `JsonCodec<Req, Res>` + type aliases for 3 RPCs
  - `registry.rs`: `AgentRegistry` (in-memory, hostname-deduped) + `AgentRateLimiter` (1-second sliding window token bucket) — 8 unit tests
  - `grpc.rs`: `CollectorGrpcService` as `tower::Service<http::Request<B>>` routing 3 RPCs (Register, SendEvents, Heartbeat) via `tonic::server::Grpc::new(codec).unary(svc, req)` — no protoc required
  - `syslog.rs`: UDP + TCP syslog receivers, RFC 3164 + RFC 5424 in-house parser, publishes to `kron.raw.{tenant_id}` — 7 unit tests
  - `http_intake.rs`: Axum router with 5 routes, Bearer auth, agent management API — publishes events to bus
  - `collector.rs`: Orchestrator spawning 5 async tasks (gRPC, HTTP, syslog UDP/TCP, dark-agent monitor), mTLS with graceful plaintext fallback
  - `main.rs`: CLI args, tracing init, tokio runtime, `Collector::new(config, shutdown).run()`
  - `kron-types/src/config.rs`: Added `CollectorConfig` fields: `tls_cert_path`, `tls_key_path`, `tls_ca_path`, `default_tenant_id`, `intake_auth_token`, `metrics_addr`
  - `kron-bus/src/traits.rs`: Added blanket `impl BusProducer for Box<dyn BusProducer>` to allow `Arc::new(box_producer)` coercion

### Decisions Made
- gRPC server implemented without protoc: `tower::Service<http::Request<B>>` routes by URI path to `tonic::server::Grpc::new(codec).unary(svc, req)` — exactly matches agent's client codec
- Tenant ID for gRPC: extracted from `RegisterRequest.labels["tenant_id"]` first, fallback to `config.default_tenant_id`
- Tenant ID for syslog/HTTP: always uses `config.default_tenant_id` (no per-connection identity)
- mTLS: `ServerTlsConfig` with client CA root required in production; graceful plaintext fallback if cert files absent (dev mode)
- TCP syslog TLS deferred to Phase 2 — `TODO(#TBD, hardik, phase-2)` comment in syslog.rs
- `EventCategory::Other` used for syslog events (no `System` variant in `EventCategory` enum)
- Dark-agent monitor: read lock for `find_timed_out_agents`, write lock for `mark_dark` — avoids holding write across await
- `impl BusProducer for Box<dyn BusProducer>` added to kron-bus to enable `Arc::new(bus.new_producer()?)` pattern

### Code Written
- `crates/kron-collector/src/error.rs` — `CollectorError` enum
- `crates/kron-collector/src/metrics.rs` — Prometheus metric functions
- `crates/kron-collector/src/shutdown.rs` — `ShutdownHandle` with broadcast + signal
- `crates/kron-collector/src/codec.rs` — `JsonCodec` + type aliases
- `crates/kron-collector/src/registry.rs` — `AgentRegistry` + `AgentRateLimiter` + unit tests
- `crates/kron-collector/src/grpc.rs` — gRPC service (Register, SendEvents, Heartbeat)
- `crates/kron-collector/src/syslog.rs` — RFC 3164/5424 parser + UDP/TCP receivers + unit tests
- `crates/kron-collector/src/http_intake.rs` — Axum HTTP server
- `crates/kron-collector/src/collector.rs` — orchestrator
- `crates/kron-collector/src/main.rs` — entry point
- Modified: `crates/kron-collector/Cargo.toml` — added all dependencies including `http-body = "0.4"`
- Modified: `crates/kron-types/src/config.rs` — extended `CollectorConfig`
- Modified: `crates/kron-bus/src/traits.rs` — blanket `BusProducer` impl for `Box<dyn BusProducer>`
- Modified: `PHASES.md` — Phase 1.5 all tasks marked `[x]`

### Known Issues / Tech Debt
- 5 dead-code warnings for fields/methods not yet consumed (will be used in Phase 1.6 normalizer): `AgentRecord::registered_at`, `AgentRecord::get()`, `SyslogFields::message`, `CollectorError::Grpc/Tls/Registry/Task`, `ShutdownHandle::trigger()`
- Integration tests not yet run (need running Redpanda/embedded bus + cert files for mTLS)
- Syslog TCP TLS is plaintext only — Phase 2 task
- `server_builder` in grpc spawn requires `mut` because `tonic::Server::builder()` returns owned value and `add_service` takes `&mut self` — fixed in this session

### Open Questions
- Should `AgentRegistry` be persisted to disk for crash recovery? Currently all state is lost on restart.
- Should the HTTP agent-management API require auth (currently unauthenticated)? Phase 2 decision.

### Next Session Should Start With
1. Read CLAUDE.md, PHASES.md, CONTEXT.md
2. **Phase 1.6 (kron-normalizer):** event parsing, enrichment, normalization pipeline
   - Reads from `kron.raw.{tenant_id}`, normalizes, writes to `kron.normalized.{tenant_id}`
   - GeoIP enrichment, FQDN resolution, asset lookup
3. Run `cargo check --workspace` first to verify all crates still compile together


---

## Session: 2026-03-22 — Phase 1.6 Normalizer (kron-normalizer) Complete

### Completed
- **Phase 1.6 (kron-normalizer):** All 12 tasks implemented, `cargo check -p kron-normalizer` passes clean
  - `error.rs`: `NormalizerError` enum (7 variants, thiserror)
  - `metrics.rs`: Prometheus functions — events normalized by format, storage errors, GeoIP lookups/misses, asset cache hits/misses, pipeline latency histogram, consumer lag gauge
  - `shutdown.rs`: `ShutdownHandle` with broadcast + SIGTERM/Ctrl-C (same pattern as collector)
  - `timestamp.rs`: 15+ format parser — RFC 3339, RFC 2822, Unix epoch (secs/millis/float), ISO space, CLF, Windows, Cisco, CEF extension, syslog BSD (year injection + roll-back) — 9 unit tests
  - `dedup.rs`: xxHash3-64 fingerprint over 7 canonical fields; `compute_and_assign` skips if already set — 5 unit tests
  - `parser/cef.rs`: CEF header (7 fields) + extension key=value parser (OnceLock regex); maps 20+ CEF keys to KronEvent fields — 4 unit tests
  - `parser/leef.rs`: LEEF 1.0 (tab) and 2.0 (custom delimiter + hex escape) — 3 unit tests
  - `parser/json_event.rs`: JSON object parser mapping 30+ keys to canonical fields — 4 unit tests
  - `parser/mod.rs`: `detect_and_parse` — routes to sub-parser or pass-through; agent events skipped — 5 unit tests
  - `enrich/geoip.rs`: MaxMind GeoLite2-City reader; no-op if MMDB absent; skips private IPs
  - `enrich/asset.rs`: TTL cache with manual eviction; always-empty backend in Phase 1.6 — 3 unit tests
  - `enrich/mod.rs`: `Enricher` orchestrator (GeoIP + asset in order)
  - `pipeline.rs`: full `parse → enrich → dedup → storage → publish` pipeline
  - `normalizer.rs`: bus consumer loop; subscribes to per-tenant topics; nacks on failure
  - `main.rs`: CLI args, tracing init, all subsystem construction, tokio runtime
  - Extended `NormalizerConfig` with `raw_tenant_ids`, `consumer_group_id`, `metrics_addr`
  - Added `maxminddb = "0.24"` to workspace Cargo.toml

### Decisions Made
- ADR-017: maxminddb for GeoLite2 IP enrichment (see DECISIONS.md)
- ADR-018: Simple HashMap + Instant for asset TTL cache (no additional crate; no-op in Phase 1.6)
- Format detection order: agent-structured → CEF → LEEF → JSON → collector_parsed
- Asset cache always empty at startup in Phase 1.6; backend wired in Phase 2 when kron-storage queries are implemented
- Storage write in pipeline is best-effort (failure logged, event still published to enriched topic)
- GeoIP: private/loopback IPs skip lookup silently; unknown IPs from public space increment miss counter

### Code Written
- All files under `crates/kron-normalizer/src/` (15 new files)
- Modified: `crates/kron-normalizer/Cargo.toml` — added 9 new dependencies
- Modified: `crates/kron-types/src/config.rs` — added 3 fields to `NormalizerConfig`
- Modified: `Cargo.toml` (workspace) — added maxminddb = "0.24"
- Modified: `DECISIONS.md` — ADR-017, ADR-018
- Modified: `PHASES.md` — Phase 1.6 all tasks marked [x]

### Known Issues / Tech Debt
- 7 dead-code warnings for fields/methods used only in Phase 2+ (asset cache insert/evict, GeoIpLookup::is_enabled, set_consumer_lag, etc.)
- Asset enrichment is a no-op until Phase 2 wires kron-storage queries
- GeoIP ASN lookup requires GeoLite2-ASN MMDB (separate file); only City lookup currently implemented
- Integration tests require running bus (Redpanda or embedded) + configured tenant IDs

### Open Questions
- Should Phase 1.6 GeoIP also resolve ASN? Requires second MMDB file (GeoLite2-ASN).
- Should the normalizer support topic wildcard subscription (all kron.raw.* topics) instead of explicit tenant list?

### Next Session Should Start With
1. Read CLAUDE.md, PHASES.md, CONTEXT.md
2. **Phase 1.7 (kron-ctl):** CLI tool — health, events query/tail, agents list, storage stats, migration commands
3. After Phase 1.7: run Phase 1 Gate acceptance test (`./scripts/phase1-acceptance.sh`)
4. Run `cargo check --workspace` to verify all crates compile together before starting 1.7

---

## Session: 2026-03-22 — Phase 1.7 CLI Tool (kron-ctl) Complete

### Completed
- **Phase 1.7 (kron-ctl):** All 8 tasks implemented, `cargo check -p kron-ctl` passes clean
  - `error.rs`: `CtlError` enum (6 variants — Config, Storage, Http, Serialise, InvalidArg, Migration)
  - `output.rs`: ASCII table renderer + status line helpers (ok/fail/warn/header) — no external crates
  - `config.rs`: `CtlConfig::load(path, collector_url_override)` — derives collector base URL from `CollectorConfig.http_addr` (replaces `0.0.0.0` with `127.0.0.1`)
  - `client.rs`: `CollectorClient` wrapping reqwest — `health()`, `list_agents()`, `register_agent()` — typed request/response structs
  - `cmd/health.rs`: Checks collector `/health` + storage `health_check()` in sequence, prints status lines
  - `cmd/events.rs`: `run_query()` (table or JSON output, RFC 3339 / relative timestamp parsing: 1h, 30m, 7d) and `run_tail()` (polling loop, prints new events as they arrive)
  - `cmd/agents.rs`: `run_list()` (GET /agents → table) and `run_create()` (POST /agents/register → prints assigned agent_id)
  - `cmd/storage.rs`: `run_stats()` — storage backend name, health, latency stats, deployment mode, DB path/URL
  - `cmd/migration.rs`: `run_migrate()` (creates AdaptiveStorage → triggers idempotent migration run) and `run_status()` (loads migration files from disk, prints version/name/checksum table)
  - `main.rs`: clap 4 derive-based CLI dispatcher — all 8 top-level tasks routed correctly
  - `Cargo.toml` (workspace): Added `clap = { version = "4", features = ["derive"] }` and `reqwest = { version = "0.12", features = ["json"], default-features = false }`
  - `Cargo.toml` (workspace): Fixed `pedantic = { level = "warn", priority = -1 }` to resolve `lint_groups_priority` clippy error (pre-existing issue)

### Decisions Made
- `kron-ctl` talks to collector via HTTP only (no direct bus connection)
- Events query/tail goes through `AdaptiveStorage` directly — no separate query API (Phase 3)
- Agent tokens in Phase 1.7 = pre-register agent ID via `POST /agents/register`; full token registry in Phase 3
- Relative timestamp parsing supports `s`, `m`, `h`, `d` suffixes (e.g. `1h` = 1 hour ago)
- Collector URL defaults: `0.0.0.0:9002` → `http://127.0.0.1:9002`; overridable via `--collector-url`

### Code Written
- `crates/kron-ctl/src/error.rs` — `CtlError`
- `crates/kron-ctl/src/output.rs` — `Table`, `ok`, `fail`, `warn`, `header`
- `crates/kron-ctl/src/config.rs` — `CtlConfig`
- `crates/kron-ctl/src/client.rs` — `CollectorClient` + typed structs
- `crates/kron-ctl/src/cmd/health.rs` — health check command
- `crates/kron-ctl/src/cmd/events.rs` — query + tail commands
- `crates/kron-ctl/src/cmd/agents.rs` — list + create commands
- `crates/kron-ctl/src/cmd/storage.rs` — stats command
- `crates/kron-ctl/src/cmd/migration.rs` — run + status commands
- `crates/kron-ctl/src/cmd/mod.rs` — module declarations
- Rewritten: `crates/kron-ctl/src/main.rs` — clap CLI dispatcher
- Modified: `crates/kron-ctl/Cargo.toml` — added clap, reqwest, serde, serde_json, chrono, uuid
- Modified: `Cargo.toml` (workspace) — added clap + reqwest; fixed lint_groups_priority

### Known Issues / Tech Debt
- `events tail` uses polling (2s by default) — not a real streaming tail; proper streaming needs WebSocket (Phase 3)
- `migration status` cannot show which migrations have already been applied (no live DB connection needed to load files, but schema_versions table would require full storage init)
- `storage stats` latency stats show zeros until real storage operations are recorded — stubs return 0

### Open Questions
- None blocking Phase 1.7

### Next Session Should Start With
1. Read CLAUDE.md, PHASES.md, CONTEXT.md
2. All of Phase 1 is now complete (1.1 through 1.7)
3. Run the Phase 1 Gate acceptance test: `./scripts/phase1-acceptance.sh`
4. If gate passes, begin Phase 2 — Detection Engine (kron-stream, SIGMA rules, IOC bloom filter, ONNX)

---

## Session: 2026-03-23 — Phase 2 Detection Engine Complete (2.1–2.5) + CI Fix

### Completed
- **CI fix (all phases):** Resolved 22 clippy/fmt failures blocking qa→main PR
  - Root cause: `pedantic=warn` + `-D warnings` in CI promoted pedantic warnings to errors
  - Fixed across 51 files: doc backticks for product names, `#[allow]` in test modules, cast fixes,
    `Default` derive, dead_code allows for Linux-only eBPF types
  - Commit: `fix(ci): resolve all clippy and rustfmt failures blocking qa→main merge`

- **Phase 2.1 — SIGMA Rule Engine (`kron-stream`):**
  - Full SIGMA YAML parser with typed AST (`sigma/types.rs`, `sigma/ast.rs`)
  - Recursive-descent condition parser (`sigma/condition.rs`) — and/or/not, quantifiers, count()
  - In-memory event matcher with all modifiers: Exact/Contains/ContainsAll/StartsWith/EndsWith/Re/Cidr/Gt/Gte/Lt/Lte (`sigma/matcher.rs`)
  - ClickHouse SQL compiler: `LOWER() LIKE`, `match()`, `isIPAddressInRange()` (`sigma/compiler_clickhouse.rs`)
  - DuckDB SQL compiler: `ILIKE`, `regexp_matches()` (`sigma/compiler_duckdb.rs`)
  - Rule loader with mtime hot-reload, DashMap registry, FP classifier, RuleEvaluator
  - Commit: `feat(stream): implement Phase 2.1 SIGMA Rule Engine`

- **Phase 2.2 — IOC Bloom Filter (`kron-stream`):**
  - Counting Bloom Filter: 4-bit nibble packed, 200M slots (100MB), k=7, xxHash3 double hashing
  - IOC types: IP/Domain/SHA256/URL with normalization
  - Feed loader: MalwareBazaar SHA256, URLhaus CSV, ThreatFox IPs, Feodo Tracker, Spamhaus DROP
  - `IocRefreshTask` with `watch::Receiver` shutdown channel
  - Commit: `feat(stream): implement Phase 2.2 IOC Bloom Filter`

- **Phase 2.3 — ONNX Inference Engine (`kron-ai`):**
  - 4 ONNX model wrappers: AnomalyScorer (6 features), UebaClassifier (4), BeaconingDetector (128 IAT), ExfilScorer (4)
  - `OnnxSession`: `Arc<Mutex<Session>>` (ort 2.x requires `&mut self` for run)
  - `ModelRegistry`: hot-swap atomic reload per slot
  - `InferenceService::score_event()` runs anomaly+exfil via `spawn_blocking`
  - ort upgraded from "1.18" (non-existent) to "2.0.0-rc.12"
  - Commit: `feat(ai): implement Phase 2.3 ONNX Inference Engine`

- **Phase 2.4 — Stream Processor pipeline (`kron-stream`):**
  - `pipeline/risk_score.rs`: F-007 formula (rule severity + IOC +20 + anomaly +15 + UEBA +10 × asset criticality)
  - `pipeline/mitre.rs`: SIGMA `attack.*` tag → tactic/technique/sub-technique
  - `pipeline/entity_graph.rs`: DashMap entity graph (User/Host/IP) with max-risk accumulation
  - `pipeline/processor.rs`: `DetectionPipeline::process()` 7-stage pipeline; `AlertCandidate` + `AlertCandidatePayload` wire form
  - `shutdown.rs`, `metrics.rs`, full `main.rs` with 8-step startup + per-tenant consumer loops
  - Commit: `feat(stream): implement Phase 2.4 Stream Processor pipeline`

- **Phase 2.5 — Alert Engine (`kron-alert`):**
  - `dedup.rs`: 15-min DashMap windows keyed by (tenant_id, rule_id, primary_asset)
  - `assembler.rs`: full `KronAlert` construction
  - `narrative.rs`: EN + Hindi summary templates with IST (UTC+5:30)
  - `notify/`: WhatsApp (Twilio), SMS (Textlocal), Email (raw async SMTP), rate limiter (1h sliding), dispatcher (fallback chain)
  - `engine.rs`: `AlertEngine` with tokio::select! loop + 30s flush timer
  - Commit: `feat(alert): implement Phase 2.5 Alert Engine`

### Decisions Made
- ADR: AlertCandidate mirrored in kron-alert/src/types.rs to avoid kron-alert → kron-stream dep (coupling via JSON over bus instead)
- ADR: ort 2.0.0-rc.12 requires `Arc<Mutex<Session>>` due to `run()` taking `&mut self`
- ADR: Aggregation/temporal SIGMA conditions return `false` in real-time mode — served by SQL compilation path only
- ADR: CIDR matching in kron-stream memory evaluator uses bitwise IPv4 arithmetic (no `ipnetwork` crate)
- ADR: DuckDB CIDR SQL compilation degrades to `1=0` — TODO(#TBD, hardik, v1.1)

### Code Written
**kron-stream:**
- `src/lib.rs`, `src/error.rs` — crate root + `StreamError`
- `src/sigma/` — 11 files (types, ast, condition, field_map, matcher, compiler, compiler_clickhouse, compiler_duckdb, fp_classifier, loader, registry, evaluator, mod)
- `src/ioc/` — 6 files (bloom, types, filter, feed, refresh, metrics, mod)
- `src/pipeline/` — 5 files (risk_score, mitre, entity_graph, processor, mod)
- `src/shutdown.rs`, `src/metrics.rs`, `src/main.rs`

**kron-ai:**
- `src/error.rs`, `src/onnx/` — 5 files (session, anomaly, ueba, beaconing, exfil, mod), `src/registry.rs`, `src/inference.rs`, `src/metrics.rs`

**kron-alert:**
- `src/error.rs`, `src/types.rs`, `src/dedup.rs`, `src/assembler.rs`, `src/narrative.rs`
- `src/notify/` — 5 files (whatsapp, sms, email, rate_limit, dispatcher, mod)
- `src/engine.rs`, `src/metrics.rs`, `src/main.rs`

### Known Issues / Tech Debt
- `libduckdb-sys` fails to build on Windows (no C++ compiler) — pre-existing environment issue; CI passes on ubuntu-latest
- DuckDB CIDR SQL compilation degrades to `1=0` — temporal/aggregation conditions also stub out at runtime
- Integration tests for Phase 2 require running Redpanda/embedded bus + real ONNX model files
- ONNX model files not included in repo (no trained models yet) — tests marked `#[ignore = "requires ONNX model file"]`
- Asset enrichment backend still a no-op from Phase 1.6 — wired in Phase 3

### Open Questions
- ONNX model training data — how will Isolation Forest and XGBoost models be trained? (Phase 4/5 concern)
- WhatsApp Business API India approval — should apply for Twilio WhatsApp sandbox now

### Next Session Should Start With
1. Read CLAUDE.md, PHASES.md, CONTEXT.md
2. Phase 2 is complete (2.1–2.5). The qa branch is ahead of origin by 5 commits — push to qa: `git push origin qa`
3. Begin **Phase 3 — Web UI + Query API**:
   - Phase 3.1: kron-auth (JWT RS256, Argon2id, TOTP, RBAC)
   - Phase 3.2: kron-query-api (Axum REST + WebSocket, OpenAPI)
   - Phase 3.3: SolidJS web UI
4. Before starting Phase 3, merge qa → main via PR (all CI should now pass)

---

## Session: 2026-03-24 — Phase 3 Web UI + Query API (3.1–3.3)

### Completed
- **chore(deps):** Added `totp-rs v5` (ADR-019), `jsonwebtoken v10` with `rust_crypto` feature
  (avoids `ring` C build — pure Rust RSA), `utoipa v4` + `utoipa-axum` + `utoipa-swagger-ui`
  (ADR-020). Commit: `1cf682f`

- **Phase 3.1 — Auth Service (`kron-auth`):**
  - `error.rs` — `AuthError` (11 variants)
  - `jwt.rs` — `JwtService` RS256 issue/validate/claims_with_grace; `JwtExtractor` Axum extractor
  - `password.rs` — `PasswordService` Argon2id m=64MiB t=3 p=4 (ADR-013)
  - `mfa.rs` — `TotpService` generate_secret / validate_totp (±1 window) / totp_uri
  - `rbac.rs` — `Role/Action/Resource` enums; pure `can()` function (5×5×9 matrix)
  - `brute_force.rs` — `BruteForceGuard` DashMap sliding window, 5 attempts → 15-min lockout
  - `session.rs` — `SessionBlocklist` jti→Instant DashMap revocation
  - `metrics.rs` — 5 Prometheus counters
  - `tests/auth_integration.rs` — round-trip tests for all modules
  - Commit: `da3c0dd`

- **Phase 3.2 — Query API (`kron-query-api`):**
  - Full Axum router: auth, events, alerts, rules, assets, health, Swagger UI at `/docs`
  - Tenant query-rewrite middleware (gate 2): injects `tenant_id` on every storage call
  - JWT auth middleware using `JwtExtractor` from kron-auth
  - Handlers: auth (login/refresh/logout), events (list/get/query), alerts (CRUD+ack+escalate+evidence),
    rules (CRUD+test+sigma-import), assets (list/get/events/alerts), health/version
  - WebSocket: live alert fan-out broadcast + event tail with severity filter
  - OpenAPI 3.1 via utoipa, Swagger UI served at `/docs`
  - 9-step startup binary (tracing→config→storage→bus→rule_registry→JWT→router→metrics→shutdown)
  - Commit: `ee66d54`

- **Phase 3.3 — SolidJS Web UI (`web/`):**
  - Vite + SolidJS + TypeScript scaffolding, Inter + JetBrains Mono fonts
  - Design system from `docs/UIUX.md`: #0A0E1A bg, #3B82F6 accent, P1–P5 severity palette
  - `src/api/client.ts` — all API calls typed (no raw fetch in components)
  - `src/stores/auth.ts` + `src/stores/alerts.ts` + `src/stores/events.ts` (createSignal)
  - Pages: Login (email/password/TOTP), Dashboard (4 KPI cards + recent alerts),
    Alerts (split-pane queue + detail with narrative + action buttons),
    Events (search form + dense table, IOC-hit red), Mitre (14-tactic heatmap),
    Settings (notification channel config)
  - Skeleton screen loading states (no spinners)
  - SolidJS Router with auth guard on every route
  - Commit: `55cf4c0`

### Decisions Made
- ADR-019: `totp-rs v5` for TOTP (spec-mandated)
- ADR-020: `utoipa v4` for OpenAPI (spec-mandated)
- `jsonwebtoken v10` with `rust_crypto` feature: avoids `ring` C build failure on Windows
  (pre-existing environment issue with MinGW); uses pure-Rust `rsa` crate instead
- ruflo MCP used for task tracking and system health monitoring during this session

### Known Remaining Phase 3 Items (not started)
- Login anomaly detection: KRON fires on its own login events (needs full pipeline wired)
- No-code rule builder (Phase 3 basic version)
- Keyboard shortcuts for alert queue (J/K/A/F/Space)
- Integration tests for kron-query-api (require running ClickHouse + Redpanda)

### Open Issues / Tech Debt
- `.claude-flow/` directory created by ruflo MCP — added to `.gitignore`
- `libduckdb-sys`, `ring`, `clickhouse-rs-cityhash-sys`, `lz4-sys` fail to build on Windows
  (no C++ compiler in MinGW) — pre-existing; CI passes on ubuntu-latest
- kron-query-api integration tests are stubs — full tests require testcontainers (Phase 3 gate)

### Next Session Should Start With
1. Read CLAUDE.md, PHASES.md, CONTEXT.md
2. Phase 3.1–3.3 is complete. qa is ahead of origin — confirm push succeeded.
3. Create PR: qa → main on GitHub. All CI checks should pass.
4. Begin **Phase 4 — MSSP + Compliance + Mobile**:
   - Phase 4.1: Multi-tenancy hardening (4-gate isolation tests, canary)
   - Phase 4.2: Compliance engine (CERT-In, DPDP, RBI, SEBI)
   - Phase 4.3: Flutter mobile app (iOS + Android, Riverpod)
5. Before Phase 4, install Node.js and run `npm install` in `web/` to verify UI builds
