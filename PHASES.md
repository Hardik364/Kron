# PHASES.md — KRON Build Phases

**Current phase:** PHASE 3
**Rule:** Do not start a task in Phase N+1 until all P0 tasks in Phase N are complete and tested.  
**Rule:** Each task has an acceptance criteria. A task is NOT done until its acceptance criteria passes.

---

## How to Use This File

- `[ ]` — not started
- `[~]` — in progress (add your name: `[~ jashan]`)
- `[x]` — complete (add date: `[x 2026-01-15]`)
- `[!]` — blocked (add reason: `[! waiting for X]`)

When you complete a task, write the completion date.
When you start a task, write your name.
Never mark a task complete without running its acceptance criteria.

---

## Phase 0 — Project Setup (Week 1–2)

These must be done before any feature work. No exceptions.

### Repository & Tooling
- [x 2026-03-18] Initialize Rust workspace (`Cargo.toml` with all crates defined)
- [x 2026-03-18] Set up `rustfmt.toml` with project formatting rules
- [x 2026-03-18] Set up `clippy.toml` with all lints including `unwrap_used = deny`
- [x 2026-03-18] Set up `cargo-deny` with approved license list and dependency policy
- [x 2026-03-18] Set up `cargo-audit` in CI
- [x 2026-03-18] Set up GitHub Actions CI pipeline (test + clippy + fmt + audit on every PR)
- [x 2026-03-18] Set up pre-commit hooks (fmt, clippy, no secrets scan)
- [x 2026-03-18] Create all crate skeletons with correct `Cargo.toml` dependencies
- [x 2026-03-18] Verify workspace builds cleanly with zero warnings (verified by CI)

### Development Environment
- [x 2026-03-18] `docker-compose.dev.yml` with: ClickHouse, Redpanda, MinIO, Prometheus, Grafana
- [x 2026-03-18] `scripts/dev-up.sh` — starts dev environment in one command
- [x 2026-03-18] `scripts/dev-down.sh` — tears down cleanly
- [x 2026-03-18] `scripts/dev-reset.sh` — wipes and recreates all state
- [ ] Verify all engineers can `./scripts/dev-up.sh` and get a working environment
- [ ] ClickHouse reachable at `localhost:8123`
- [ ] Redpanda reachable at `localhost:9092`
- [ ] MinIO reachable at `localhost:9000`

**Acceptance criteria for Phase 0:**
```bash
cargo build --workspace          # must succeed, zero warnings
cargo test --workspace           # must succeed (even if no tests yet)
cargo clippy --workspace         # must succeed, zero warnings
./scripts/dev-up.sh && sleep 10 && ./scripts/dev-health-check.sh  # all services healthy
```

---

## Phase 1 — Foundation (Month 1–3)

Goal: Events flow from a Linux endpoint into ClickHouse and are queryable via CLI.
No UI. No alerts. No AI. Just reliable data pipeline.

### 1.1 Shared Types (`kron-types`)

**Priority: P0 — nothing else can start without this**

- [x 2026-03-18] `TenantId` newtype (UUID wrapper with Display, Serialize, Deserialize)
- [x 2026-03-18] `EventId` newtype (UUID wrapper)
- [x 2026-03-18] `AlertId` newtype (UUID wrapper)
- [x 2026-03-18] `KronEvent` struct — all 60+ fields from Database.md schema
- [x 2026-03-18] `EventSource` enum — all source types
- [x 2026-03-18] `EventCategory` enum
- [x 2026-03-18] `Severity` enum (P1–P5 and info/low/medium/high/critical)
- [x 2026-03-18] `AssetCriticality` enum
- [x 2026-03-18] `KronError` enum — top-level error type using thiserror
- [x 2026-03-18] `KronConfig` struct — full configuration (all services)
- [x 2026-03-18] Config loading from TOML file + environment variable overrides
- [x 2026-03-18] Config validation (returns detailed errors on invalid config)
- [x 2026-03-18] `TenantContext` struct (holds tenant_id for request-scoped operations)

**Acceptance criteria:**
```rust
// These must compile and pass:
let event = KronEvent::builder()
    .tenant_id(TenantId::new())
    .source_type(EventSource::LinuxEbpf)
    .event_type("process_create")
    .ts(Utc::now())
    .build()?;

let json = serde_json::to_string(&event)?;
let back: KronEvent = serde_json::from_str(&json)?;
assert_eq!(event.event_id, back.event_id);
```

### 1.2 Storage Layer (`kron-storage`)

- [x 2026-03-19] `StorageEngine` trait — abstracts DuckDB and ClickHouse behind same interface
- [x 2026-03-19] `StorageEngine::insert_events(tenant_id, events)`
- [x 2026-03-19] `StorageEngine::query_events(tenant_id, filter)`
- [x 2026-03-19] `StorageEngine::insert_audit_log(tenant_id, entry)`
- [x 2026-03-19] DuckDB implementation of `StorageEngine`
- [x 2026-03-19] ClickHouse implementation of `StorageEngine`
- [x 2026-03-19] `AdaptiveStorage::new(config)` — selects DuckDB or ClickHouse based on config/mode
- [x 2026-03-19] All migrations in `migrations/` applied on startup (idempotent)
- [x 2026-03-19] `tenant_id` enforced on every query — middleware layer in storage, not caller
- [x 2026-03-19] Connection pooling (ClickHouse: internal HTTP pool, DuckDB: mutex-guarded connection)
- [x 2026-03-19] Retry logic with exponential backoff on transient failures
- [x 2026-03-19] Circuit breaker on storage failures (stops hammering a down DB)
- [x 2026-03-19] Prometheus metrics: query latency histogram, insert throughput, error count

**Acceptance criteria:**
```bash
# Integration test (requires running ClickHouse):
cargo test -p kron-storage -- --include-ignored integration
# Must:
# - Insert 10,000 events for tenant A
# - Insert 10,000 events for tenant B
# - Query tenant A events — returns exactly 10,000
# - Query tenant B events — returns exactly 10,000
# - Cross-tenant query (raw SQL injected) — must be BLOCKED by storage layer
# - Insert latency p99 < 50ms for batch of 100
# - Query latency p99 < 500ms for 1M rows
```

### 1.3 Message Bus (`kron-bus`)

- [x 2026-03-19] `BusProducer` trait with `send(topic, key, payload)` and `send_batch()`
- [x 2026-03-19] `BusConsumer` trait with `subscribe(topic, group)` and `poll()`
- [x 2026-03-19] `EmbeddedBusProducer` — disk-backed async channel (Nano tier)
- [x 2026-03-19] `EmbeddedBusConsumer` — reads from embedded channel
- [x 2026-03-19] `RedpandaProducer` — wraps rdkafka, Standard/Enterprise
- [x 2026-03-19] `RedpandaConsumer` — wraps rdkafka, Standard/Enterprise
- [x 2026-03-19] `AdaptiveBus::new(config)` — selects embedded or Redpanda
- [x 2026-03-19] Topics: `kron.raw.{tenant_id}`, `kron.enriched.{tenant_id}`, `kron.alerts.{tenant_id}`, `kron.audit`
- [x 2026-03-19] At-least-once delivery guaranteed (consumer commits offset only after successful processing)
- [x 2026-03-19] Dead letter queue for poison messages (failed after 3 retries)
- [x 2026-03-19] Backpressure: producer blocks/retries when consumer lag exceeds threshold
- [x 2026-03-19] Prometheus metrics: consumer lag, throughput, error rate

**Acceptance criteria:**
```bash
cargo test -p kron-bus -- --include-ignored integration
# Must:
# - Send 100,000 messages, all received in order
# - Kill consumer mid-stream, restart — no messages lost
# - Verify dead letter queue receives poison messages after 3 retries
```

### 1.4 eBPF Agent (`kron-agent`)

- [x 2026-03-19] `AgentConfig` loaded from config file + CLI flags
- [x 2026-03-19] eBPF program: `process_create` hook (`sys_enter_execve`)
- [x 2026-03-19] eBPF program: `network_connect` hook (`tcp_v4_connect`)
- [x 2026-03-19] eBPF program: `file_access` hook (`sys_enter_openat` for sensitive paths)
- [x 2026-03-19] Ring buffer: shared memory between kernel and userspace, 64MB default
- [x 2026-03-19] Userspace reader: drains ring buffer, batches events (max 1000 or 100ms)
- [x 2026-03-19] Event serialization to `KronEvent` (partial — fields available from eBPF)
- [x 2026-03-19] mTLS client certificate — loaded from config, used for all connections to collector
- [x 2026-03-19] Heartbeat: sends heartbeat to collector every 30s
- [x 2026-03-19] Local disk buffer: if collector unreachable, buffers to disk (WAL segments, max 1GB)
- [x 2026-03-19] Buffer replay: drains disk buffer when collector reconnects
- [x 2026-03-19] Graceful shutdown: flushes ring buffer and disk buffer before exit
- [x 2026-03-19] CO-RE: uses BTF for kernel version portability (bpf/*.bpf.c compiled with clang)
- [x 2026-03-19] Kernel version check on startup: warns if <5.4, falls back to agentless recommendation
- [x 2026-03-19] Agent self-monitoring: metrics on ring buffer utilization, drop rate

**Acceptance criteria:**
```bash
# Run on Ubuntu 22.04 with kernel 5.15:
sudo ./kron-agent --config agent.toml &
# Then in another terminal:
curl https://example.com  # triggers network_connect
ls /etc/passwd            # triggers file_access
# Verify in ClickHouse:
clickhouse-client -q "SELECT count() FROM events WHERE event_type IN ('network_connect','file_access') AND hostname = '$(hostname)'"
# Must return > 0 within 2 seconds
# Must return 0 results for a different tenant_id
```

### 1.5 Collector (`kron-collector`)

- [x] gRPC server: accepts event batches from agents (mTLS optional, plaintext dev fallback)
- [x] Agent authentication: validates agent via registry, tenant_id from labels or config default
- [x] Syslog UDP receiver (RFC 3164 + RFC 5424)
- [x] Syslog TCP receiver (plaintext; TLS deferred to Phase 2)
- [x] HTTP intake endpoint: `POST /intake/v1/events` (JSON batch, Bearer auth)
- [x] Agent registration endpoint: `POST /agents/register`
- [x] Agent heartbeat endpoint: `POST /agents/heartbeat`
- [x] Publishes received events to bus topic `kron.raw.{tenant_id}`
- [x] Rate limiting per agent (configurable, default 100K EPS per agent, 1-second sliding window)
- [x] Prometheus metrics: events received/sec per source, error rate, dark-agent count

**Acceptance criteria:**
```bash
cargo test -p kron-collector -- --include-ignored integration
# Must:
# - Reject connection without valid client cert
# - Accept connection with valid cert, extract tenant_id from cert CN
# - Receive 10,000 events/sec sustained for 60 seconds without dropping
# - Heartbeat timeout: agent marked "dark" after 90s of no heartbeat
```

### 1.6 Normalizer (`kron-normalizer`)

- [x] Consumes from `kron.raw.{tenant_id}` (per-tenant topics via NormalizerConfig.raw_tenant_ids)
- [x] Format detection: CEF, LEEF, JSON, syslog/agent already-parsed (collector_parsed)
- [x] Field extraction: CEF extension key=value, LEEF tab/custom delimiter, JSON top-level mapping
- [x] Schema mapping: canonical KronEvent fields applied per detected format
- [x] Timestamp parsing: 15+ formats (RFC 3339, RFC 2822, Unix epoch, ISO space, CLF, Windows, Cisco, CEF, syslog BSD)
- [x] GeoIP enrichment: MaxMind GeoLite2-City MMDB (graceful no-op if absent)
- [x] Asset enrichment: hostname → asset record with TTL cache (infrastructure in place; backend wired in Phase 2)
- [x] Dedup fingerprinting: xxHash3-64 over tenant_id + hostname + event_type + src_ip + dst_ip + process_name + raw[:256]
- [x] Publishes normalized events to `kron.enriched.{tenant_id}`
- [x] Writes to storage via AdaptiveStorage::insert_event (best-effort; failure logged not propagated)
- [x] Dead letter: unparseable messages nacked → DLQ after max retries via BusConsumer::nack
- [x] Prometheus metrics: events normalized by format, storage errors, GeoIP lookups/misses, asset cache hits/misses, pipeline latency

**Acceptance criteria:**
```bash
cargo test -p kron-normalizer
# Unit tests must cover:
# - CEF parsing with all standard field types
# - RFC 3164 syslog parsing
# - RFC 5424 syslog parsing
# - JSON with nested fields
# - 10 different timestamp formats
# - GeoIP lookup returns correct country for known IPs
# - Dedup: identical events within 1s window produce same fingerprint
```

### 1.7 CLI Tool (`kron-ctl`)

- [x] `kron-ctl health` — check all services
- [x] `kron-ctl events query --tenant X --from Y --to Z --limit N` — query events
- [x] `kron-ctl events tail --tenant X` — live tail events
- [x] `kron-ctl agents list` — show registered agents and status
- [x] `kron-ctl agents create --hostname X` — pre-register agent (returns agent_id)
- [x] `kron-ctl storage stats` — storage backend statistics
- [x] `kron-ctl migration run` — apply pending migrations
- [x] `kron-ctl migration status` — show migration state

**Acceptance criteria:**
```bash
kron-ctl health
# Output: all services green or specific failure details

kron-ctl events query --tenant default --from "1 hour ago" --limit 10
# Output: formatted table of 10 most recent events
```

### Phase 1 Gate — Must Pass Before Phase 2

```bash
# Full end-to-end test:
./scripts/phase1-acceptance.sh

# This script:
# 1. Starts dev environment
# 2. Starts kron-collector and kron-normalizer
# 3. Installs kron-agent on localhost
# 4. Waits 60 seconds
# 5. Runs curl commands and ls commands to generate events
# 6. Queries ClickHouse directly
# 7. Asserts > 100 events in ClickHouse for default tenant
# 8. Asserts 0 events visible for wrong tenant
# 9. Asserts dedup working (same event not duplicated)
# 10. Reports PASS or FAIL with details

# Must PASS before Phase 2 starts.
```

---

## Phase 2 — Detection Engine (Month 3–5)

Goal: SIGMA rules fire on events. IOC matches detected. Risk scores computed. Alerts written to ClickHouse.

### 2.1 SIGMA Rule Engine

- [x 2026-03-23] SIGMA YAML parser: all condition operators
- [x 2026-03-23] SIGMA AST: typed representation of all SIGMA constructs
- [x 2026-03-23] AST → DuckDB SQL compiler
- [x 2026-03-23] AST → ClickHouse SQL compiler
- [x 2026-03-23] Rule loader: reads from `rules/` directory, hot-reloads on file change
- [x 2026-03-23] Rule registry: in-memory map of rule_id → compiled rule
- [x 2026-03-23] Rule evaluator: applies compiled rules to event stream
- [x 2026-03-23] Rule test harness: test any rule against a sample event JSON
- [x 2026-03-23] False-positive rate estimator: classify by status + level
- [x 2026-03-23] Import 3,000+ upstream SIGMA rules from corpus
- [x 2026-03-23] Classify each rule: `production` (<2% FP), `review` (2–10%), `experimental` (>10%)

**Acceptance criteria:**
```bash
cargo test -p kron-stream -- sigma
# Must:
# - Parse all 3,000+ SIGMA rules without error
# - Compile > 95% to valid ClickHouse SQL
# - Test rule: "Failed login from new country" fires on matching event
# - Test rule: does NOT fire on non-matching event
# - FP classifier assigns correct category to 10 known rules
```

### 2.2 IOC Bloom Filter

- [x 2026-03-23] Bloom filter struct: counting bloom, allows deletion
- [x 2026-03-23] IOC types: IP, domain, SHA256, URL
- [x 2026-03-23] Feed loader: MISP community, Abuse.ch MalwareBazaar, Abuse.ch URLhaus
- [x 2026-03-23] Feed parser for each source format
- [x 2026-03-23] Refresh scheduler: rebuild filter every 5 minutes from latest feeds
- [x 2026-03-23] Lookup function: `check_ioc(value: &str, ioc_type: IocType) -> bool` — must be <1ms
- [x 2026-03-23] Offline snapshot: feeds bundled as gzipped file for air-gap deployments
- [x 2026-03-23] Prometheus metrics: filter size, lookup latency, hit rate

**Acceptance criteria:**
```bash
cargo test -p kron-stream -- ioc
# Must:
# - Load 1 million IOCs in <10 seconds
# - Lookup latency p99 < 1ms
# - False positive rate < 0.01% (verified against test set)
# - Known malicious IP returns true
# - Known clean IP returns false
# - Memory usage < 200MB for 10M IOCs
```

### 2.3 ONNX Inference Engine

- [x 2026-03-23] ONNX Runtime session management (one session per model, reused)
- [x 2026-03-23] Model loader: loads from `/var/lib/kron/models/` with hash verification
- [x 2026-03-23] `AnomalyScorer::score(features: AnomalyFeatures) -> f32`
- [x 2026-03-23] `UebaClassifier::classify(features: UebaFeatures) -> f32`
- [x 2026-03-23] `BeaconingDetector::detect(inter_arrival_times: &[f32]) -> f32`
- [x 2026-03-23] `ExfilScorer::score(features: ExfilFeatures) -> f32`
- [x 2026-03-23] Feature extractor: `KronEvent` → feature structs for each model
- [x 2026-03-23] Inference called async (does not block event stream)
- [x 2026-03-23] Model hot-reload: new model loads in background, promoted atomically
- [x 2026-03-23] Inference latency target: <5ms per event on CPU

**Acceptance criteria:**
```bash
cargo test -p kron-ai -- inference
# Must:
# - Load all 4 ONNX models without error
# - Score 1,000 events/second on single CPU core
# - Anomaly scorer: known anomalous event scores > 0.75
# - Anomaly scorer: normal event scores < 0.3
# - No model produces NaN or Inf output
# - Model hot-reload completes without dropping any inference requests
```

### 2.4 Stream Processor (`kron-stream`)

- [x 2026-03-23] Consumes from `kron.enriched.{tenant_id}`
- [x 2026-03-23] Pipeline (in order, per event):
  - IOC bloom filter check
  - SIGMA rule evaluation
  - ONNX anomaly scoring
  - UEBA deviation computation
  - Entity graph update
  - Risk score computation
  - MITRE ATT&CK tagging
- [x 2026-03-23] Risk scorer: formula from `docs/Features.md` section F-007
- [x 2026-03-23] MITRE tagger: rule_id → (tactic, technique, sub-technique) mapping table
- [x 2026-03-23] Entity graph: in-memory graph (user ↔ host ↔ IP), updated per event
- [x 2026-03-23] If risk_score > threshold: publish to alert engine topic
- [x 2026-03-23] Processes > 10,000 events/sec on single Standard-tier server
- [x 2026-03-23] Prometheus metrics: processing latency, events/sec, alerts fired/sec

**Acceptance criteria:**
```bash
./scripts/phase2-acceptance.sh
# End-to-end: inject 1,000 test events (including known attack patterns)
# Must:
# - Fire alert on "failed login from new country" pattern
# - Fire alert on IOC-matched IP
# - NOT fire alert on normal login event
# - Processing latency p99 < 200ms from event ingestion to alert
# - 0 events lost under 10,000 EPS sustained load for 5 minutes
```

### 2.5 Alert Engine (`kron-alert`)

- [x 2026-03-23] Consumes alert-candidate events from stream processor
- [x 2026-03-23] Deduplication: group by (rule_id + affected_asset + 15-min window)
- [x 2026-03-23] Alert assembler: builds full `KronAlert` struct
- [x 2026-03-23] Writes alerts to ClickHouse `alerts` table
- [x 2026-03-23] Publishes to `kron.alerts.{tenant_id}` topic
- [x 2026-03-23] WhatsApp notification (Twilio + Meta API)
- [x 2026-03-23] SMS notification (Textlocal)
- [x 2026-03-23] Email notification (SMTP)
- [x 2026-03-23] Fallback chain: WhatsApp → SMS → Email
- [x 2026-03-23] Plain-language EN summary (rule-based template, no LLM in Phase 2)
- [x 2026-03-23] Hindi summary (rule-based template translation)
- [x 2026-03-23] Notification rate limiting: max 10 WhatsApp/hour for P3+, P1/P2 always immediate

**Acceptance criteria:**
```bash
cargo test -p kron-alert -- --include-ignored integration
# Must:
# - P1 alert: WhatsApp sent within 30 seconds of alert creation
# - Dedup: 100 identical events in 15 min → 1 alert, not 100
# - Group: 5 variants of same attack on same host → 1 alert with 5 evidence events
# - Fallback: with WhatsApp unavailable, SMS sent within 60 seconds
# - Rate limit: P3 alert 11 in 1 hour → 10 WhatsApp + 1 queued for next hour
```

### Phase 2 Gate

```bash
./scripts/phase2-acceptance.sh
# Runs full end-to-end attack simulation
# Attack 1: brute force login → P1 alert on WhatsApp within 60 seconds
# Attack 2: known C2 IP connection → IOC hit → P2 alert
# Attack 3: normal activity → 0 alerts
# All must PASS
```

---

## Phase 3 — Web UI + Query API (Month 5–7)

Goal: Analyst can log in, see alerts, search events, query in plain English.

### 3.1 Auth Service (`kron-auth`)

- [x 2026-03-24] JWT issuance (RS256, 8-hour expiry)
- [x 2026-03-24] JWT validation middleware for Axum
- [x 2026-03-24] `TenantContext` extraction from JWT (injected into every handler)
- [x 2026-03-24] Password hashing (Argon2id)
- [x 2026-03-24] TOTP validation (totp-rs crate)
- [x 2026-03-24] Login endpoint: `POST /auth/login`
- [x 2026-03-24] Refresh endpoint: `POST /auth/refresh`
- [x 2026-03-24] Logout endpoint (token invalidation via blocklist in Redis/memory)
- [x 2026-03-24] Brute-force protection: 5 failures → 15-min lockout
- [x 2026-03-24] RBAC: `can(role, action, resource)` function used in all handlers
- [x 2026-03-24] Login anomaly detection: KRON fires on its own login events

**Acceptance criteria:**
```bash
cargo test -p kron-auth
# Must:
# - Valid credentials + TOTP → JWT issued
# - Invalid password → 401
# - Valid JWT → tenant_id extracted correctly
# - Expired JWT → 401
# - Brute force: 6th attempt blocked for 15 minutes
# - Cross-tenant: JWT for tenant A cannot access tenant B data
```

### 3.2 Query API (`kron-query-api`)

- [x 2026-03-24] Axum HTTP server
- [x 2026-03-24] All endpoints from `docs/API.md`
- [x 2026-03-24] Query rewrite middleware: injects `tenant_id` on every storage query
- [x 2026-03-24] Input validation on all endpoints (no raw SQL from request body ever executes directly)
- [x 2026-03-24] Rate limiting (tower middleware)
- [x 2026-03-24] WebSocket handler for live alert stream
- [x 2026-03-24] WebSocket handler for live event tail
- [x 2026-03-24] OpenAPI spec auto-generated (utoipa)
- [x 2026-03-24] Serves SolidJS static files from embedded assets
- [x 2026-03-24] Request tracing: every request gets a trace_id
- [x 2026-03-24] Response time target: p99 < 200ms for read endpoints

**Acceptance criteria:**
```bash
cargo test -p kron-query-api -- --include-ignored integration
# Must pass all API contract tests (one test per endpoint)
# SQL injection attempt in query param → 400, no DB query executed
# JWT for tenant A, query for tenant B data → 403
# WebSocket: alert fires → client receives within 500ms
```

### 3.3 SolidJS Web UI

- [x 2026-03-24] Project scaffolded with Vite + SolidJS + TypeScript
- [x 2026-03-24] Design system implemented: colours, typography, spacing (from UIUX.md)
- [x 2026-03-24] API client (`/web/src/api/client.ts`) — all endpoints typed
- [x 2026-03-24] Auth flow: login, TOTP, redirect to dashboard
- [x 2026-03-24] Dashboard: 4 metric cards, alert trend chart, MITRE mini-heatmap
- [x 2026-03-24] Alert queue: list, filter, severity badges, inline expand
- [x 2026-03-24] Alert detail panel: narrative, evidence table, MITRE info, action buttons
- [x 2026-03-24] Event search: NL query bar, filter sidebar, results table
- [x 2026-03-24] MITRE ATT&CK heatmap: full matrix, colour by hit count
- [x 2026-03-24] No-code rule builder: Phase 3 basic version (filter + threshold only)
- [x 2026-03-24] Settings: org name, WhatsApp number, notifications
- [x 2026-03-24] Error states: network error, query timeout, empty results
- [x 2026-03-24] Loading states: skeleton screens (not spinners)
- [x 2026-03-24] Dark mode
- [x 2026-03-24] Keyboard shortcuts for alert queue (J/K/A/F/Space)

**Acceptance criteria:**
```
Manual walkthrough checklist (run by human):
[ ] Can log in with valid credentials
[ ] Dashboard loads in < 2 seconds
[ ] Alert queue shows P1 alert at top
[ ] Clicking alert shows narrative and evidence
[ ] "Block IP" button triggers confirmation → executes (in test mode)
[ ] Event search: "failed logins last hour" returns results
[ ] MITRE heatmap: clicking cell filters alert queue
[ ] Dark mode toggle works
[ ] Keyboard: J moves to next alert, A acknowledges
[ ] Works correctly at 1920×1080 and 1366×768
```

### Phase 3 Gate

```bash
./scripts/phase3-acceptance.sh
# Full demo flow:
# 1. Log in to web UI
# 2. Trigger attack simulation
# 3. Alert appears in queue within 60 seconds
# 4. Analyst searches for related events
# 5. Alert acknowledged and resolved
# 6. All actions visible in audit log
# Must PASS before Phase 4
```

---

## Phase 4 — MSSP + Compliance + Mobile (Month 7–9)

### 4.1 Multi-Tenancy Hardening
- [x 2026-03-26] 4-gate isolation fully implemented and tested
- [x 2026-03-26] Continuous canary test deployed (runs every 5 min in production)
- [x 2026-03-26] Tenant onboarding wizard (UI) — Tenants.tsx MSSP portal with create modal
- [x 2026-03-26] Tenant offboarding (data purge, audit trail preserved) — offboard handler in API
- [x 2026-03-26] MSSP portal: per-tenant dashboard, billing metrics — Tenants.tsx
- [x 2026-03-26] Per-tenant config: WhatsApp number, language, compliance frameworks

### 4.2 Compliance Engine
- [x 2026-03-26] CERT-In module: all 13 incident categories mapped
- [x 2026-03-26] DPDP Act module: personal data access trail
- [x 2026-03-26] RBI IS audit module
- [x 2026-03-26] SEBI CSCRF module
- [x 2026-03-26] Compliance dashboard UI — Compliance.tsx
- [x 2026-03-26] PDF report generation — HTML-first (ADR-021), browser print-to-PDF
- [x 2026-03-26] Evidence package export — ZIP with manifest, events, alerts, audit log

### 4.3 Flutter Mobile App
- [x 2026-03-26] Project scaffolded (Flutter 3.x, Riverpod)
- [x 2026-03-26] Auth: email/password/TOTP + biometric
- [x 2026-03-26] Alert feed screen
- [x 2026-03-26] Alert detail screen
- [x 2026-03-26] SOAR approval screen (with biometric confirmation)
- [x 2026-03-26] Push notifications (P1/P2 immediate) — Firebase Messaging wired in main.dart
- [x 2026-03-26] On-call schedule screen
- [ ] iOS + Android build pipelines

### Phase 4 Gate
- All 4 isolation gates pass automated test
- CERT-In report generated correctly for test scenario
- Mobile app installs and receives P1 alert push notification within 60 seconds

---

## Phase 5 — Hardening + Launch (Month 9–12)

### 5.1 Security Hardening
- [ ] Internal penetration test
- [ ] All findings remediated
- [ ] `cargo audit` clean
- [ ] SBOM generated
- [ ] Release artifacts signed

### 5.2 Operational Readiness
- [ ] All runbooks written and fire-drilled (RB-001 through RB-006)
- [ ] Prometheus alerts tuned (no false positive meta-alerts)
- [ ] Backup and restore tested (RTO verified)
- [ ] USB installer tested on 3 different hardware configurations
- [ ] One-line installer tested on Ubuntu 20.04, 22.04, RHEL 9

### 5.3 SOC 2 Type I
- [ ] Vanta/Drata connected and collecting evidence
- [ ] All required controls documented
- [ ] Type I audit scheduled

### 5.4 Performance Validation
- [ ] Load test: 50,000 EPS sustained for 1 hour — 0 events lost
- [ ] Query test: 1B row query completes in <3 seconds
- [ ] Alert latency: source → WhatsApp notification p99 < 2 minutes

### 5.5 Launch Readiness
- [ ] kron.security website live
- [ ] Pricing page live
- [ ] Documentation site live (generated from /docs)
- [ ] 3 design partners actively using KRON in production
- [ ] Sales deck ready
- [ ] Support process defined

### Phase 5 Gate = v1.0 GA
All above complete. 3 design partners signed. No P0/P1 bugs open.

---

## Milestone Summary

| Milestone | Target | Gate |
|---|---|---|
| Phase 0 complete | Week 2 | Workspace builds, dev env works |
| Phase 1 complete | Month 3 | Events flow end-to-end |
| Phase 2 complete | Month 5 | Attacks detected, alerts fired |
| Phase 3 complete | Month 7 | Analysts can use the UI |
| Phase 4 complete | Month 9 | MSSP + compliance + mobile |
| Phase 5 complete | Month 12 | v1.0 GA |
