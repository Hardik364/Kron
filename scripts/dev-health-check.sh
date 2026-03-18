#!/usr/bin/env bash
# dev-health-check.sh — Verifies all KRON dev services are healthy.
#
# Usage: ./scripts/dev-health-check.sh
#
# Exits 0 if all 5 services are healthy.
# Exits 1 if any service fails to become healthy within the timeout.
#
# Called automatically by dev-up.sh. Can also be run standalone.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.dev"

# Load port overrides from .env.dev if it exists
if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -o allexport
    source "${ENV_FILE}"
    set +o allexport
fi

TIMEOUT=120
INTERVAL=5
ELAPSED=0

CH_PORT="${CLICKHOUSE_HTTP_PORT:-8123}"
RP_PORT="${REDPANDA_ADMIN_PORT:-9644}"
MINIO_PORT="${MINIO_API_PORT:-9000}"
PROM_PORT="${PROMETHEUS_PORT:-9090}"
GRAF_PORT="${GRAFANA_PORT:-3000}"

check_clickhouse() {
    curl -sf "http://localhost:${CH_PORT}/ping" >/dev/null 2>&1
}

check_redpanda() {
    docker exec kron-redpanda-dev rpk cluster health >/dev/null 2>&1
}

check_minio() {
    curl -sf "http://localhost:${MINIO_PORT}/minio/health/live" >/dev/null 2>&1
}

check_prometheus() {
    curl -sf "http://localhost:${PROM_PORT}/-/healthy" >/dev/null 2>&1
}

check_grafana() {
    curl -sf "http://localhost:${GRAF_PORT}/api/health" >/dev/null 2>&1
}

print_status() {
    local ch_ok="$1" rp_ok="$2" minio_ok="$3" prom_ok="$4" graf_ok="$5"
    printf "  ClickHouse  %-8s  (http://localhost:%s/ping)\n"  "$([[ ${ch_ok} == true ]] && echo OK || echo waiting)" "${CH_PORT}"
    printf "  Redpanda    %-8s  (localhost:%s)\n"               "$([[ ${rp_ok} == true ]] && echo OK || echo waiting)" "${RP_PORT}"
    printf "  MinIO       %-8s  (http://localhost:%s)\n"        "$([[ ${minio_ok} == true ]] && echo OK || echo waiting)" "${MINIO_PORT}"
    printf "  Prometheus  %-8s  (http://localhost:%s)\n"        "$([[ ${prom_ok} == true ]] && echo OK || echo waiting)" "${PROM_PORT}"
    printf "  Grafana     %-8s  (http://localhost:%s)\n"        "$([[ ${graf_ok} == true ]] && echo OK || echo waiting)" "${GRAF_PORT}"
}

ALL_HEALTHY=false

while [[ ${ELAPSED} -lt ${TIMEOUT} ]]; do
    CH_OK=false
    RP_OK=false
    MINIO_OK=false
    PROM_OK=false
    GRAF_OK=false

    check_clickhouse  && CH_OK=true    || true
    check_redpanda    && RP_OK=true    || true
    check_minio       && MINIO_OK=true || true
    check_prometheus  && PROM_OK=true  || true
    check_grafana     && GRAF_OK=true  || true

    print_status "${CH_OK}" "${RP_OK}" "${MINIO_OK}" "${PROM_OK}" "${GRAF_OK}"

    if ${CH_OK} && ${RP_OK} && ${MINIO_OK} && ${PROM_OK} && ${GRAF_OK}; then
        ALL_HEALTHY=true
        break
    fi

    if [[ ${ELAPSED} -lt ${TIMEOUT} ]]; then
        sleep "${INTERVAL}"
        ELAPSED=$(( ELAPSED + INTERVAL ))
        printf "\033[5A"  # move cursor up 5 lines to overwrite status
    fi
done

echo ""
if ${ALL_HEALTHY}; then
    echo "All services healthy (${ELAPSED}s)."
    exit 0
else
    echo "ERROR: Services not healthy after ${TIMEOUT}s."
    echo ""
    echo "Check logs:"
    echo "  docker compose -f deploy/compose/docker-compose.dev.yml logs"
    exit 1
fi
