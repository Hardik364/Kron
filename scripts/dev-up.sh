#!/usr/bin/env bash
# dev-up.sh — Starts the KRON development environment.
#
# Usage: ./scripts/dev-up.sh
#
# Starts: ClickHouse, Redpanda, MinIO, Prometheus, Grafana
# Then calls dev-health-check.sh to confirm all services are healthy.
#
# Requirements:
#   - Docker and Docker Compose v2 installed
#   - .env.dev file exists (copy from .env.dev.example if not)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/deploy/compose/docker-compose.dev.yml"
ENV_FILE="${REPO_ROOT}/.env.dev"

# Validate prerequisites
if ! command -v docker &>/dev/null; then
    echo "ERROR: docker is not installed or not in PATH."
    exit 1
fi

if ! docker compose version &>/dev/null; then
    echo "ERROR: Docker Compose v2 is required (docker compose, not docker-compose)."
    exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
    echo "ERROR: .env.dev not found."
    echo ""
    echo "Create it from the example:"
    echo "  cp .env.dev.example .env.dev"
    echo ""
    echo "Then edit .env.dev with your preferred passwords and re-run."
    exit 1
fi

echo "Starting KRON dev environment..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d

echo ""
echo "Waiting for all services to be healthy..."
"${SCRIPT_DIR}/dev-health-check.sh"

echo ""
echo "KRON dev environment is ready."
echo ""
echo "  ClickHouse:  http://localhost:8123"
echo "  Redpanda:    localhost:9092  (admin: localhost:9644)"
echo "  MinIO:       http://localhost:9000  (console: http://localhost:9001)"
echo "  Prometheus:  http://localhost:9090"
echo "  Grafana:     http://localhost:3000"
echo ""
echo "To stop:  ./scripts/dev-down.sh"
echo "To reset: ./scripts/dev-reset.sh"
