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

*Future sessions append here.*
