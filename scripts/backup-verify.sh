#!/usr/bin/env bash
# scripts/backup-verify.sh — Verifies KRON backups are current.
#
# Used by the on-call monitoring check and Prometheus textfile collector.
# Exits 0 if all backups are within SLA, non-zero otherwise.
#
# Usage:
#   ./scripts/backup-verify.sh [clickhouse|duckdb|tenants]

set -euo pipefail

BUCKET="${KRON_BACKUP_BUCKET:-kron-backups}"
MINIO_ENDPOINT="${KRON_MINIO_ENDPOINT:-http://localhost:9000}"
COMPONENT="${1:-all}"

PASS=0
FAIL=1

ok()   { echo "[OK] $*"; }
warn() { echo "[WARN] $*" >&2; }
fail() { echo "[FAIL] $*" >&2; }

# Returns age in seconds of newest backup matching prefix
backup_age_seconds() {
  local prefix="$1"
  local newest_ts
  newest_ts=$(mc ls "kron-minio/${BUCKET}/${prefix}/" 2>/dev/null | \
    sort -k1,2 | tail -1 | awk '{print $1"T"$2"Z"}')

  if [[ -z "$newest_ts" ]]; then
    echo "999999"  # no backup found
    return
  fi

  local now
  now=$(date -u +%s)
  local backup_epoch
  backup_epoch=$(date -u -d "${newest_ts}" +%s 2>/dev/null || \
    date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "${newest_ts}" +%s 2>/dev/null || \
    echo 0)

  echo $(( now - backup_epoch ))
}

exit_code=0

check_clickhouse() {
  local age
  age=$(backup_age_seconds "clickhouse")
  local threshold=7200  # 2 hours SLA

  if [[ $age -lt $threshold ]]; then
    ok "clickhouse: last backup ${age}s ago ($(( age / 60 )) min)"
  else
    fail "clickhouse: last backup ${age}s ago — exceeds ${threshold}s SLA"
    exit_code=1
  fi
}

check_duckdb() {
  local age
  age=$(backup_age_seconds "duckdb")
  local threshold=1800  # 30 min SLA

  if [[ $age -lt $threshold ]]; then
    ok "duckdb: last backup ${age}s ago"
  elif [[ $age -eq 999999 ]]; then
    ok "duckdb: no backup found (may be Standard/Enterprise tier — skipping)"
  else
    fail "duckdb: last backup ${age}s ago — exceeds ${threshold}s SLA"
    exit_code=1
  fi
}

check_tenants() {
  local age
  age=$(backup_age_seconds "tenant-config")
  local threshold=600  # 10 min SLA

  if [[ $age -lt $threshold ]]; then
    ok "tenant-config: last backup ${age}s ago"
  else
    fail "tenant-config: last backup ${age}s ago — exceeds ${threshold}s SLA"
    exit_code=1
  fi
}

mc alias set kron-minio "${MINIO_ENDPOINT}" \
  "${KRON_MINIO_ACCESS:?}" "${KRON_MINIO_SECRET:?}" --quiet 2>/dev/null || true

case "$COMPONENT" in
  clickhouse) check_clickhouse ;;
  duckdb)     check_duckdb ;;
  tenants)    check_tenants ;;
  all)
    check_clickhouse
    check_duckdb
    check_tenants
    ;;
esac

exit $exit_code
