#!/usr/bin/env bash
# scripts/backup.sh — KRON backup script.
#
# Backs up ClickHouse data, DuckDB files, and tenant configuration to MinIO.
# Designed to run from cron every hour (incremental) and daily (full).
#
# Usage:
#   ./scripts/backup.sh [--full] [--dry-run]
#
# Required environment variables:
#   KRON_BACKUP_BUCKET  — MinIO bucket name (default: kron-backups)
#   KRON_MINIO_ENDPOINT — MinIO endpoint (default: http://localhost:9000)
#   KRON_MINIO_ACCESS   — MinIO access key
#   KRON_MINIO_SECRET   — MinIO secret key
#   KRON_CH_HOST        — ClickHouse host (default: localhost)
#   KRON_DATA_DIR       — Data directory (default: /var/lib/kron)

set -euo pipefail

FULL=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full)    FULL=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

BUCKET="${KRON_BACKUP_BUCKET:-kron-backups}"
MINIO_ENDPOINT="${KRON_MINIO_ENDPOINT:-http://localhost:9000}"
CH_HOST="${KRON_CH_HOST:-localhost}"
DATA_DIR="${KRON_DATA_DIR:-/var/lib/kron}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
LOG_PREFIX="[backup ${TIMESTAMP}]"

log()  { echo "${LOG_PREFIX} $*"; }
err()  { echo "${LOG_PREFIX} ERROR: $*" >&2; }
die()  { err "$*"; exit 1; }

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    log "[DRY-RUN] $*"
  else
    "$@"
  fi
}

# ── Preflight checks ──────────────────────────────────────────────────────────

command -v mc   >/dev/null 2>&1 || die "mc (MinIO client) not found. Install from https://min.io/docs/minio/linux/reference/minio-mc.html"
command -v clickhouse-client >/dev/null 2>&1 || die "clickhouse-client not found."

# Configure mc alias if not already done
mc alias set kron-minio \
  "${MINIO_ENDPOINT}" \
  "${KRON_MINIO_ACCESS:?KRON_MINIO_ACCESS must be set}" \
  "${KRON_MINIO_SECRET:?KRON_MINIO_SECRET must be set}" \
  --quiet 2>/dev/null || true

# ── ClickHouse backup ─────────────────────────────────────────────────────────

backup_clickhouse() {
  local backup_type
  backup_type=$([ $FULL -eq 1 ] && echo "full" || echo "incremental")
  local backup_name="clickhouse-${backup_type}-${TIMESTAMP}"

  log "Starting ClickHouse ${backup_type} backup: ${backup_name}"

  if [[ $FULL -eq 1 ]]; then
    run clickhouse-client -h "${CH_HOST}" -q "
      BACKUP DATABASE kron
      TO S3('${MINIO_ENDPOINT}/${BUCKET}/clickhouse/${backup_name}',
             '${KRON_MINIO_ACCESS}', '${KRON_MINIO_SECRET}')
    "
  else
    # Incremental: only partitions modified since last backup
    local last_backup
    last_backup=$(mc ls "kron-minio/${BUCKET}/clickhouse/" 2>/dev/null | \
      grep "clickhouse-" | sort -k4 | tail -1 | awk '{print $NF}' | tr -d '/')

    if [[ -z "$last_backup" ]]; then
      log "No previous backup found — falling back to full backup"
      FULL=1
      backup_clickhouse
      return
    fi

    run clickhouse-client -h "${CH_HOST}" -q "
      BACKUP DATABASE kron
      TO S3('${MINIO_ENDPOINT}/${BUCKET}/clickhouse/${backup_name}',
             '${KRON_MINIO_ACCESS}', '${KRON_MINIO_SECRET}')
      SETTINGS base_backup = S3('${MINIO_ENDPOINT}/${BUCKET}/clickhouse/${last_backup}',
                                 '${KRON_MINIO_ACCESS}', '${KRON_MINIO_SECRET}')
    "
  fi

  log "ClickHouse backup complete: ${backup_name}"

  # Record timestamp for backup monitoring
  run mc tag set "kron-minio/${BUCKET}/clickhouse/${backup_name}/" \
    "backup_type=${backup_type}" \
    "kron_version=$(cat /etc/kron/version 2>/dev/null || echo unknown)" \
    "timestamp=${TIMESTAMP}"
}

# ── DuckDB backup (Nano tier) ─────────────────────────────────────────────────

backup_duckdb() {
  local db_path="${DATA_DIR}/kron.duckdb"
  if [[ ! -f "$db_path" ]]; then
    log "DuckDB file not found at ${db_path} — skipping (Standard/Enterprise tier?)"
    return 0
  fi

  local backup_name="duckdb-${TIMESTAMP}.duckdb.zst"
  log "Backing up DuckDB: ${db_path} → ${BUCKET}/duckdb/${backup_name}"

  # Checkpoint WAL before backup to ensure consistency
  run duckdb "${db_path}" "CHECKPOINT;"

  run zstd -3 -T0 "${db_path}" -o "/tmp/${backup_name}"
  run mc cp "/tmp/${backup_name}" "kron-minio/${BUCKET}/duckdb/${backup_name}"
  run rm -f "/tmp/${backup_name}"

  log "DuckDB backup complete: ${backup_name}"
}

# ── Tenant config backup ──────────────────────────────────────────────────────

backup_tenant_config() {
  local config_path="${DATA_DIR}/tenants.json"
  if [[ ! -f "$config_path" ]]; then
    log "tenants.json not found — skipping"
    return 0
  fi

  # Validate JSON before backup
  jq . "${config_path}" >/dev/null || die "tenants.json is not valid JSON — aborting tenant config backup"

  local backup_name="tenants-${TIMESTAMP}.json"
  log "Backing up tenant config: ${config_path} → ${BUCKET}/tenant-config/${backup_name}"

  run mc cp "${config_path}" "kron-minio/${BUCKET}/tenant-config/${backup_name}"
  log "Tenant config backup complete"
}

# ── Prune old backups ─────────────────────────────────────────────────────────

prune_old_backups() {
  log "Pruning old backups..."

  # Keep 90 days of incremental, 30 days of full
  local cutoff_incremental
  cutoff_incremental=$(date -u -d "90 days ago" +"%Y-%m-%d" 2>/dev/null || \
    date -u -v-90d +"%Y-%m-%d")  # macOS fallback

  mc rm --recursive --force --older-than 90d \
    "kron-minio/${BUCKET}/clickhouse/" 2>/dev/null || true

  mc rm --recursive --force --older-than 7d \
    "kron-minio/${BUCKET}/duckdb/" 2>/dev/null || true

  mc rm --recursive --force --older-than 30d \
    "kron-minio/${BUCKET}/tenant-config/" 2>/dev/null || true

  log "Pruning complete"
}

# ── Update backup timestamp metric ───────────────────────────────────────────

update_metric() {
  local metric_type="$1"
  local epoch
  epoch=$(date +%s)

  # Write to Prometheus textfile collector directory if available
  local metric_dir="/var/lib/node_exporter/textfile_collector"
  if [[ -d "$metric_dir" ]]; then
    echo "kron_last_backup_timestamp_seconds{type=\"${metric_type}\"} ${epoch}" \
      > "${metric_dir}/kron_backup.prom"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  log "Starting KRON backup (full=$FULL, dry-run=$DRY_RUN)"

  backup_clickhouse
  backup_duckdb
  backup_tenant_config

  if [[ $FULL -eq 1 ]]; then
    prune_old_backups
    update_metric "clickhouse_full"
  else
    update_metric "clickhouse_incremental"
  fi

  log "All backups complete."
}

main
