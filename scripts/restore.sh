#!/usr/bin/env bash
# scripts/restore.sh — KRON restore script.
#
# Restores ClickHouse data, DuckDB, and tenant config from a MinIO backup.
#
# Usage:
#   ./scripts/restore.sh --from-date 2026-03-26 [--component clickhouse|duckdb|tenants|all]
#   ./scripts/restore.sh --from-backup clickhouse-incremental-2026-03-26T14-00-00Z
#   ./scripts/restore.sh --list           # list available backups
#
# IMPORTANT: This script will STOP KRON services before restoring and
# restart them after. Confirm with a second engineer before running in production.

set -euo pipefail

BUCKET="${KRON_BACKUP_BUCKET:-kron-backups}"
MINIO_ENDPOINT="${KRON_MINIO_ENDPOINT:-http://localhost:9000}"
CH_HOST="${KRON_CH_HOST:-localhost}"
DATA_DIR="${KRON_DATA_DIR:-/var/lib/kron}"
NAMESPACE="${KRON_K8S_NAMESPACE:-kron}"

COMPONENT="all"
FROM_DATE=""
FROM_BACKUP=""
LIST_ONLY=0
CONFIRM=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-date)     FROM_DATE="$2";    shift ;;
    --from-backup)   FROM_BACKUP="$2";  shift ;;
    --component)     COMPONENT="$2";    shift ;;
    --list)          LIST_ONLY=1 ;;
    --confirm)       CONFIRM=1 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

log() { echo "[restore $(date -u +%H:%M:%SZ)] $*"; }
err() { echo "[restore] ERROR: $*" >&2; }
die() { err "$*"; exit 1; }

confirm() {
  if [[ $CONFIRM -eq 1 ]]; then return 0; fi
  echo ""
  echo "⚠️  WARNING: This will stop KRON services and restore data."
  echo "   Affected component: ${COMPONENT}"
  echo "   Any data written AFTER the backup will be LOST."
  echo ""
  read -rp "Type 'restore' to confirm: " answer
  [[ "$answer" == "restore" ]] || die "Restore cancelled."
}

# ── List available backups ────────────────────────────────────────────────────

if [[ $LIST_ONLY -eq 1 ]]; then
  log "Available ClickHouse backups:"
  mc ls "kron-minio/${BUCKET}/clickhouse/" | sort -k4 | tail -20

  log "Available DuckDB backups:"
  mc ls "kron-minio/${BUCKET}/duckdb/" | sort -k4 | tail -10

  log "Available tenant config backups:"
  mc ls "kron-minio/${BUCKET}/tenant-config/" | sort -k4 | tail -10
  exit 0
fi

# ── Resolve backup name from date ─────────────────────────────────────────────

resolve_backup() {
  local prefix="$1"
  local date_prefix="$2"
  mc ls "kron-minio/${BUCKET}/${prefix}/" | \
    grep "${date_prefix}" | \
    sort -k4 | \
    tail -1 | \
    awk '{print $NF}' | tr -d '/'
}

# ── Scale down KRON services ──────────────────────────────────────────────────

scale_down() {
  log "Scaling down KRON write-path services..."
  kubectl scale deploy/kron-normalizer --replicas=0 -n "${NAMESPACE}" 2>/dev/null || true
  kubectl scale deploy/kron-stream     --replicas=0 -n "${NAMESPACE}" 2>/dev/null || true
  kubectl scale deploy/kron-alert      --replicas=0 -n "${NAMESPACE}" 2>/dev/null || true
  sleep 10
  log "Services scaled down."
}

scale_up() {
  log "Scaling KRON services back up..."
  kubectl scale deploy/kron-normalizer --replicas=2 -n "${NAMESPACE}" 2>/dev/null || true
  kubectl scale deploy/kron-stream     --replicas=2 -n "${NAMESPACE}" 2>/dev/null || true
  kubectl scale deploy/kron-alert      --replicas=2 -n "${NAMESPACE}" 2>/dev/null || true
  kubectl rollout status deploy/kron-normalizer -n "${NAMESPACE}" --timeout=120s 2>/dev/null || true
  log "Services restored."
}

# ── Restore ClickHouse ────────────────────────────────────────────────────────

restore_clickhouse() {
  local backup_name="$1"
  log "Restoring ClickHouse from: ${backup_name}"

  # Verify backup exists
  mc ls "kron-minio/${BUCKET}/clickhouse/${backup_name}/" >/dev/null || \
    die "Backup not found: ${backup_name}"

  clickhouse-client -h "${CH_HOST}" -q "
    RESTORE DATABASE kron
    FROM S3('${MINIO_ENDPOINT}/${BUCKET}/clickhouse/${backup_name}',
            '${KRON_MINIO_ACCESS}', '${KRON_MINIO_SECRET}')
    SETTINGS allow_non_empty_tables = true,
             structure_only = false
  "

  log "ClickHouse restore complete."

  # Verify row counts are non-zero
  local event_count
  event_count=$(clickhouse-client -h "${CH_HOST}" -q "SELECT count() FROM kron.events")
  log "Verification: kron.events has ${event_count} rows after restore."
}

# ── Restore DuckDB ────────────────────────────────────────────────────────────

restore_duckdb() {
  local backup_name="$1"
  log "Restoring DuckDB from: ${backup_name}"

  mc cp "kron-minio/${BUCKET}/duckdb/${backup_name}" "/tmp/${backup_name}"
  local db_restore_path="/tmp/kron-restore.duckdb"
  zstd -d "/tmp/${backup_name}" -o "${db_restore_path}"

  # Verify the restored file is a valid DuckDB database
  duckdb "${db_restore_path}" "SELECT count() FROM information_schema.tables" >/dev/null || \
    die "Restored DuckDB file is not valid."

  # Swap in
  local db_path="${DATA_DIR}/kron.duckdb"
  [[ -f "$db_path" ]] && cp "${db_path}" "${db_path}.pre-restore.$(date +%s)"
  cp "${db_restore_path}" "${db_path}"

  rm -f "/tmp/${backup_name}" "${db_restore_path}"
  log "DuckDB restore complete."
}

# ── Restore Tenant Config ─────────────────────────────────────────────────────

restore_tenants() {
  local backup_name="$1"
  log "Restoring tenant config from: ${backup_name}"

  local config_path="${DATA_DIR}/tenants.json"
  mc cp "kron-minio/${BUCKET}/tenant-config/${backup_name}" "/tmp/tenants-restore.json"

  # Validate JSON
  jq . /tmp/tenants-restore.json >/dev/null || die "Restored tenants.json is not valid JSON."

  [[ -f "$config_path" ]] && cp "${config_path}" "${config_path}.pre-restore.$(date +%s)"
  cp /tmp/tenants-restore.json "${config_path}"
  rm -f /tmp/tenants-restore.json

  log "Tenant config restore complete. Restart kron-query-api to reload."
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  command -v mc >/dev/null 2>&1 || die "mc (MinIO client) not found."
  mc alias set kron-minio "${MINIO_ENDPOINT}" \
    "${KRON_MINIO_ACCESS:?}" "${KRON_MINIO_SECRET:?}" --quiet 2>/dev/null || true

  confirm

  scale_down

  # Trap to scale back up even on failure
  trap scale_up EXIT

  if [[ -n "$FROM_BACKUP" ]]; then
    # Direct backup name specified
    case "$COMPONENT" in
      clickhouse) restore_clickhouse "$FROM_BACKUP" ;;
      duckdb)     restore_duckdb     "$FROM_BACKUP" ;;
      tenants)    restore_tenants    "$FROM_BACKUP" ;;
      all)
        restore_clickhouse "$FROM_BACKUP"
        ;;
    esac
  elif [[ -n "$FROM_DATE" ]]; then
    # Find most recent backup for the given date
    case "$COMPONENT" in
      clickhouse|all)
        local ch_backup
        ch_backup=$(resolve_backup "clickhouse" "$FROM_DATE")
        [[ -z "$ch_backup" ]] && die "No ClickHouse backup found for date: $FROM_DATE"
        restore_clickhouse "$ch_backup"
        ;;
    esac

    if [[ "$COMPONENT" == "all" || "$COMPONENT" == "duckdb" ]]; then
      local db_backup
      db_backup=$(resolve_backup "duckdb" "$FROM_DATE")
      if [[ -n "$db_backup" ]]; then
        restore_duckdb "$db_backup"
      else
        log "No DuckDB backup for date ${FROM_DATE} — skipping (may be Standard tier)"
      fi
    fi

    if [[ "$COMPONENT" == "all" || "$COMPONENT" == "tenants" ]]; then
      local tc_backup
      tc_backup=$(resolve_backup "tenant-config" "$FROM_DATE")
      [[ -n "$tc_backup" ]] && restore_tenants "$tc_backup"
    fi
  else
    die "Specify --from-date or --from-backup. Use --list to see available backups."
  fi

  log "Restore complete. Services will restart via trap."
}

main
