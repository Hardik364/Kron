#!/usr/bin/env bash
# dev-down.sh — Stops the KRON development environment.
#
# Usage: ./scripts/dev-down.sh
#
# Stops all containers but PRESERVES volumes (data is kept).
# To wipe all data, use: ./scripts/dev-reset.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/deploy/compose/docker-compose.dev.yml"

echo "Stopping KRON dev environment..."
docker compose -f "${COMPOSE_FILE}" down

echo "KRON dev environment stopped. Data volumes are preserved."
echo "Run ./scripts/dev-up.sh to restart."
