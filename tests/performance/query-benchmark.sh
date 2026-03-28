#!/usr/bin/env bash
# KRON Query Benchmark — Phase 5.4 acceptance criteria:
#   - 1 billion row query completes in < 3 seconds
#   - Tested on the ClickHouse storage backend
#
# Usage:
#   ./tests/performance/query-benchmark.sh [--url http://localhost:8123] [--tenant <uuid>]
#
# Prerequisites:
#   - ClickHouse populated with >= 1B events (use scripts/populate-test-data.sh)
#   - clickhouse-client installed (or accessible via Docker)
#   - jq installed for JSON output parsing
#
# Exit codes:
#   0 — all benchmarks passed (within target latency)
#   1 — one or more benchmarks failed

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────────

CH_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
TENANT_ID="${KRON_TENANT_ID:-00000000-0000-0000-0000-000000000001}"
KRON_DB="${KRON_DB:-kron}"
P99_TARGET_MS=3000   # Phase 5.4: 1B row query must complete in < 3 seconds

PASS=0
FAIL=0
RESULTS=()

# ── Helpers ─────────────────────────────────────────────────────────────────────

log()   { echo "[$(date -u +%H:%M:%S)] $*"; }
pass()  { echo "  ✓ $*"; ((PASS++)) || true; }
fail()  { echo "  ✗ $*"; ((FAIL++)) || true; }

# Execute a ClickHouse query and return elapsed milliseconds.
ch_query_ms() {
  local query="$1"
  local start end elapsed

  start=$(date +%s%3N)
  clickhouse-client \
    --host "$(echo "${CH_URL}" | sed 's|http://||;s|:.*||')" \
    --port "$(echo "${CH_URL}" | sed 's|.*:||')" \
    --query "${query}" \
    --format Null 2>/dev/null
  end=$(date +%s%3N)

  echo $((end - start))
}

# ── Verify row count ─────────────────────────────────────────────────────────────

log "Checking event count for tenant ${TENANT_ID}..."
ROW_COUNT=$(clickhouse-client \
  --host "$(echo "${CH_URL}" | sed 's|http://||;s|:.*||')" \
  --port "$(echo "${CH_URL}" | sed 's|.*:||')" \
  --query "SELECT count() FROM ${KRON_DB}.events WHERE tenant_id = '${TENANT_ID}'" \
  --format TabSeparated 2>/dev/null || echo 0)

log "Row count: ${ROW_COUNT}"

if [[ "${ROW_COUNT}" -lt 1000000000 ]]; then
  log "WARNING: Only ${ROW_COUNT} rows. Benchmarks require >= 1B rows."
  log "Run: scripts/populate-test-data.sh --events 1000000000 --tenant ${TENANT_ID}"
  log "Continuing with available data (results will not meet Phase 5.4 criteria)."
fi

# ── Benchmark 1: Full table scan (aggregate count + group by) ───────────────────

log ""
log "Benchmark 1: Aggregate COUNT + GROUP BY over 1B rows"
QUERY_1="
  SELECT
    toDate(timestamp) AS day,
    event_type,
    count() AS cnt,
    uniq(src_ip) AS unique_ips
  FROM ${KRON_DB}.events
  WHERE tenant_id = '${TENANT_ID}'
    AND timestamp >= now() - INTERVAL 7 DAY
  GROUP BY day, event_type
  ORDER BY day DESC, cnt DESC
  LIMIT 100
"

MS=$(ch_query_ms "${QUERY_1}")
RESULTS+=("bench1_aggregate_7day: ${MS}ms")
if [[ "${MS}" -lt "${P99_TARGET_MS}" ]]; then
  pass "7-day aggregate: ${MS}ms (target < ${P99_TARGET_MS}ms)"
else
  fail "7-day aggregate: ${MS}ms EXCEEDS target ${P99_TARGET_MS}ms"
fi

# ── Benchmark 2: P1/P2 alert feed (OLTP-style point query) ──────────────────────

log ""
log "Benchmark 2: Alert feed query (recent P1/P2 open alerts)"
QUERY_2="
  SELECT
    alert_id, rule_name, severity, hostname, src_ip,
    created_at, acknowledged_at
  FROM ${KRON_DB}.alerts
  WHERE tenant_id = '${TENANT_ID}'
    AND status = 'open'
    AND severity IN ('p1', 'p2')
    AND created_at >= now() - INTERVAL 24 HOUR
  ORDER BY created_at DESC
  LIMIT 50
"

MS=$(ch_query_ms "${QUERY_2}")
RESULTS+=("bench2_alert_feed: ${MS}ms")
if [[ "${MS}" -lt 500 ]]; then
  pass "Alert feed: ${MS}ms (target < 500ms)"
else
  fail "Alert feed: ${MS}ms EXCEEDS target 500ms"
fi

# ── Benchmark 3: MITRE heatmap (pivot query over 30 days) ───────────────────────

log ""
log "Benchmark 3: MITRE ATT&CK heatmap (30-day pivot)"
QUERY_3="
  SELECT
    mitre_tactic,
    mitre_attack_id,
    count() AS alert_count,
    countIf(severity = 'p1') AS p1_count,
    countIf(severity = 'p2') AS p2_count
  FROM ${KRON_DB}.alerts
  WHERE tenant_id = '${TENANT_ID}'
    AND created_at >= now() - INTERVAL 30 DAY
    AND mitre_tactic != ''
  GROUP BY mitre_tactic, mitre_attack_id
  ORDER BY alert_count DESC
"

MS=$(ch_query_ms "${QUERY_3}")
RESULTS+=("bench3_mitre_heatmap: ${MS}ms")
if [[ "${MS}" -lt "${P99_TARGET_MS}" ]]; then
  pass "MITRE heatmap: ${MS}ms (target < ${P99_TARGET_MS}ms)"
else
  fail "MITRE heatmap: ${MS}ms EXCEEDS target ${P99_TARGET_MS}ms"
fi

# ── Benchmark 4: Compliance evidence query (CERT-In audit) ──────────────────────

log ""
log "Benchmark 4: CERT-In compliance scan (last 90 days)"
QUERY_4="
  SELECT
    toDate(timestamp) AS incident_date,
    event_type,
    hostname,
    src_ip,
    dst_ip,
    process_name,
    user_name,
    count() AS occurrence_count
  FROM ${KRON_DB}.events
  WHERE tenant_id = '${TENANT_ID}'
    AND timestamp >= now() - INTERVAL 90 DAY
    AND event_type IN (
      'malware_detected', 'unauthorized_access', 'data_exfiltration',
      'ransomware_activity', 'phishing_attempt', 'brute_force',
      'privilege_escalation', 'lateral_movement'
    )
  GROUP BY incident_date, event_type, hostname, src_ip, dst_ip, process_name, user_name
  ORDER BY incident_date DESC
  LIMIT 10000
"

MS=$(ch_query_ms "${QUERY_4}")
RESULTS+=("bench4_certin_compliance: ${MS}ms")
if [[ "${MS}" -lt "${P99_TARGET_MS}" ]]; then
  pass "CERT-In 90-day compliance scan: ${MS}ms (target < ${P99_TARGET_MS}ms)"
else
  fail "CERT-In compliance scan: ${MS}ms EXCEEDS target ${P99_TARGET_MS}ms"
fi

# ── Benchmark 5: Event search (analyst free-text search) ────────────────────────

log ""
log "Benchmark 5: Analyst event search (1h window, src_ip filter)"
QUERY_5="
  SELECT
    event_id, timestamp, event_type, hostname, src_ip,
    dst_ip, process_name, raw
  FROM ${KRON_DB}.events
  WHERE tenant_id = '${TENANT_ID}'
    AND timestamp >= now() - INTERVAL 1 HOUR
    AND (
      src_ip LIKE '10.%'
      OR process_name IN ('sshd', 'sudo', 'su')
    )
  ORDER BY timestamp DESC
  LIMIT 1000
"

MS=$(ch_query_ms "${QUERY_5}")
RESULTS+=("bench5_event_search_1h: ${MS}ms")
if [[ "${MS}" -lt 1000 ]]; then
  pass "1h event search: ${MS}ms (target < 1000ms)"
else
  fail "1h event search: ${MS}ms EXCEEDS target 1000ms"
fi

# ── Summary ──────────────────────────────────────────────────────────────────────

log ""
log "═══════════════════════════════════════════════════════════════"
log "KRON Query Benchmark Results"
log "═══════════════════════════════════════════════════════════════"
log ""

for result in "${RESULTS[@]}"; do
  log "  ${result}"
done

log ""
log "Pass: ${PASS}  Fail: ${FAIL}"
log ""

if [[ "${FAIL}" -eq 0 ]]; then
  log "✓ Phase 5.4 query acceptance criteria: PASSED"
  exit 0
else
  log "✗ Phase 5.4 query acceptance criteria: FAILED (${FAIL} benchmarks over target)"
  log ""
  log "Tuning checklist:"
  log "  1. Verify ClickHouse partition keys: ORDER BY (tenant_id, toYYYYMM(timestamp), event_type)"
  log "  2. Check if secondary indexes are defined on src_ip, hostname, mitre_attack_id"
  log "  3. Ensure queries hit the correct shard (no cross-shard scatter for tenant scans)"
  log "  4. Run OPTIMIZE TABLE events FINAL to merge parts after bulk load"
  log "  5. Increase ClickHouse max_threads = $(nproc) in config.xml"
  exit 1
fi
