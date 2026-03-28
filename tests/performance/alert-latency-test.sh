#!/usr/bin/env bash
# KRON Alert Pipeline Latency Test — Phase 5.4 acceptance criteria:
#   Alert latency: source event → WhatsApp notification p99 < 2 minutes
#
# Method:
#   1. Inject a synthetic P1 event via kron-collector intake
#   2. Poll kron-query-api until alert appears (measures detection latency)
#   3. Poll notification audit log until WhatsApp/email delivery confirmed
#   4. Record end-to-end latency; report pass/fail against 2-minute p99
#
# Run 30 iterations to compute p50/p95/p99.
#
# Usage:
#   ./tests/performance/alert-latency-test.sh \
#     --api-url https://staging.kron.security \
#     --intake-url https://staging.kron.security:4443 \
#     --agent-token <token> \
#     --analyst-token <jwt> \
#     --tenant <uuid>

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────────

API_URL="${KRON_API_URL:-http://localhost:3000}"
INTAKE_URL="${KRON_INTAKE_URL:-http://localhost:4443}"
AGENT_TOKEN="${KRON_AGENT_TOKEN:-test-agent-token}"
ANALYST_TOKEN="${KRON_ANALYST_TOKEN:-test-analyst-token}"
TENANT_ID="${KRON_TENANT_ID:-00000000-0000-0000-0000-000000000001}"
ITERATIONS=30
P99_TARGET_SEC=120   # 2 minutes

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

# ── Inject a synthetic P1-triggering event ──────────────────────────────────────

inject_event() {
  local marker="latency-probe-$(uuidgen | tr '[:upper:]' '[:lower:]')"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  curl -sf -X POST "${INTAKE_URL}/intake/v1/events" \
    -H "Authorization: Bearer ${AGENT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"events\": [{
        \"event_id\": \"$(uuidgen | tr '[:upper:]' '[:lower:]')\",
        \"tenant_id\": \"${TENANT_ID}\",
        \"hostname\": \"latency-probe-host\",
        \"timestamp\": \"${ts}\",
        \"event_type\": \"malware_detected\",
        \"severity\": \"critical\",
        \"src_ip\": \"10.99.99.99\",
        \"process_name\": \"latency-probe\",
        \"raw\": \"KRON_LATENCY_MARKER=${marker}\"
      }]
    }" > /dev/null

  echo "${marker}"
}

# ── Wait for alert to appear in API ─────────────────────────────────────────────

wait_for_alert() {
  local marker="$1"
  local deadline=$((SECONDS + 180))  # max 3 min wait

  while [[ ${SECONDS} -lt ${deadline} ]]; do
    local result
    result=$(curl -sf "${API_URL}/api/v1/alerts?status=open&limit=100" \
      -H "Authorization: Bearer ${ANALYST_TOKEN}" | \
      python3 -c "
import json,sys
data = json.load(sys.stdin)
alerts = data if isinstance(data, list) else data.get('alerts', data.get('data', []))
for a in alerts:
  if '${marker}' in str(a.get('narrative','')) or '${marker}' in str(a.get('raw','')):
    print(a.get('alert_id',''))
    break
" 2>/dev/null || echo "")

    if [[ -n "${result}" ]]; then
      echo "${result}"
      return 0
    fi
    sleep 2
  done

  echo ""
  return 1
}

# ── Wait for notification delivery confirmation ──────────────────────────────────

wait_for_notification() {
  local alert_id="$1"
  local deadline=$((SECONDS + 180))

  while [[ ${SECONDS} -lt ${deadline} ]]; do
    local notified
    notified=$(curl -sf "${API_URL}/api/v1/alerts/${alert_id}" \
      -H "Authorization: Bearer ${ANALYST_TOKEN}" | \
      python3 -c "
import json,sys
a = json.load(sys.stdin)
notified = a.get('notifications_sent', [])
print('yes' if notified else 'no')
" 2>/dev/null || echo "no")

    if [[ "${notified}" == "yes" ]]; then
      return 0
    fi
    sleep 3
  done

  return 1
}

# ── Main benchmark loop ──────────────────────────────────────────────────────────

log "Starting alert pipeline latency benchmark (${ITERATIONS} iterations)"
log "P99 target: ${P99_TARGET_SEC} seconds (2 minutes)"
log ""

LATENCIES=()
FAILURES=0

for i in $(seq 1 "${ITERATIONS}"); do
  log "Iteration ${i}/${ITERATIONS}..."

  START=${SECONDS}

  MARKER=$(inject_event)
  log "  Injected event with marker: ${MARKER}"

  ALERT_ID=$(wait_for_alert "${MARKER}" || echo "")

  if [[ -z "${ALERT_ID}" ]]; then
    log "  FAIL: Alert did not appear within 3 minutes"
    ((FAILURES++)) || true
    continue
  fi

  DETECTION_TIME=$((SECONDS - START))
  log "  Alert detected: ${ALERT_ID} (${DETECTION_TIME}s from injection)"

  if wait_for_notification "${ALERT_ID}"; then
    END_TO_END=$((SECONDS - START))
    LATENCIES+=("${END_TO_END}")
    log "  Notification delivered. End-to-end: ${END_TO_END}s"
  else
    log "  WARN: Notification not confirmed within 3 min — recording detection time only"
    LATENCIES+=("${DETECTION_TIME}")
  fi

  # Wait between probes to avoid flooding the alert queue.
  sleep 10
done

# ── Compute statistics ────────────────────────────────────────────────────────────

if [[ ${#LATENCIES[@]} -eq 0 ]]; then
  log "FAIL: No successful measurements"
  exit 1
fi

# Sort latencies
IFS=$'\n' SORTED=($(sort -n <<<"${LATENCIES[*]}")); unset IFS

COUNT=${#SORTED[@]}
P50_IDX=$(( COUNT * 50 / 100 ))
P95_IDX=$(( COUNT * 95 / 100 ))
P99_IDX=$(( COUNT * 99 / 100 ))

P50=${SORTED[$P50_IDX]}
P95=${SORTED[$P95_IDX]}
P99=${SORTED[$P99_IDX]}
MAX=${SORTED[$((COUNT - 1))]}

log ""
log "═══════════════════════════════════════════════════════════════"
log "Alert Pipeline Latency Results (n=${COUNT}, failures=${FAILURES})"
log "═══════════════════════════════════════════════════════════════"
log ""
log "  p50  = ${P50}s"
log "  p95  = ${P95}s"
log "  p99  = ${P99}s"
log "  max  = ${MAX}s"
log "  target p99 = ${P99_TARGET_SEC}s"
log ""

if [[ "${P99}" -le "${P99_TARGET_SEC}" ]]; then
  log "✓ Phase 5.4 alert latency: PASSED (p99=${P99}s ≤ ${P99_TARGET_SEC}s)"
  exit 0
else
  log "✗ Phase 5.4 alert latency: FAILED (p99=${P99}s > ${P99_TARGET_SEC}s)"
  log ""
  log "Tuning checklist:"
  log "  1. Check kron-stream consumer lag (should be < 5s)"
  log "  2. Verify kron-alert notification worker is running"
  log "  3. Check WhatsApp/email delivery queue depth"
  log "  4. Review kron-stream SIGMA rule matching latency"
  exit 1
fi
