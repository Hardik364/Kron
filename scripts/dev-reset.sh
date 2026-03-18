#!/usr/bin/env bash
# dev-reset.sh — Stops the KRON dev environment and wipes ALL data volumes.
#
# Usage: ./scripts/dev-reset.sh
#
# WARNING: This DELETES all local ClickHouse, Redpanda, and MinIO data.
# Use when you need a clean slate (e.g., after schema migrations, or to
# reproduce a fresh-install scenario).
#
# To stop without wiping, use: ./scripts/dev-down.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/deploy/compose/docker-compose.dev.yml"

echo "WARNING: This will DELETE all local dev data (ClickHouse, Redpanda, MinIO)."
echo ""
read -r -p "Are you sure? Type 'yes' to confirm: " confirm

if [[ "${confirm}" != "yes" ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Stopping and removing all containers and volumes..."
docker compose -f "${COMPOSE_FILE}" down -v

echo ""
echo "Starting fresh environment..."
"${SCRIPT_DIR}/dev-up.sh"
