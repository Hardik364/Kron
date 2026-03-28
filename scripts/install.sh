#!/usr/bin/env bash
# scripts/install.sh — KRON one-line installer.
#
# Installs KRON on Ubuntu 20.04/22.04 or RHEL 8/9 (x86_64).
# Requires root or sudo.
#
# Usage:
#   curl -fsSL https://install.kron.security | sudo bash
#   # Or with options:
#   curl -fsSL https://install.kron.security | sudo bash -s -- --tier nano --version v1.0.0
#
# Options:
#   --tier     nano|standard|enterprise  (default: nano)
#   --version  vX.Y.Z                   (default: latest stable)
#   --data-dir /path/to/data            (default: /var/lib/kron)
#   --no-start                           install only, don't start services

set -euo pipefail

KRON_TIER="${KRON_TIER:-nano}"
KRON_VERSION="${KRON_VERSION:-}"
KRON_DATA_DIR="${KRON_DATA_DIR:-/var/lib/kron}"
KRON_START=1
KRON_REGISTRY="ghcr.io/hardik364/kron"
KRON_INSTALL_DIR="/opt/kron"
KRON_BIN_DIR="/usr/local/bin"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier)     KRON_TIER="$2";     shift ;;
    --version)  KRON_VERSION="$2";  shift ;;
    --data-dir) KRON_DATA_DIR="$2"; shift ;;
    --no-start) KRON_START=0 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

# ── Colour output ─────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${BLUE}[KRON]${RESET} $*"; }
success() { echo -e "${GREEN}[KRON]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[KRON]${RESET} WARNING: $*"; }
die()     { echo -e "${RED}[KRON]${RESET} ERROR: $*" >&2; exit 1; }
bold()    { echo -e "${BOLD}$*${RESET}"; }

# ── Detect OS ─────────────────────────────────────────────────────────────────

detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    source /etc/os-release
    OS_ID="$ID"
    OS_VERSION_ID="$VERSION_ID"
  else
    die "Cannot detect OS — /etc/os-release not found."
  fi

  case "$OS_ID" in
    ubuntu)
      [[ "$OS_VERSION_ID" =~ ^(20\.04|22\.04|24\.04)$ ]] || \
        warn "Ubuntu ${OS_VERSION_ID} is not officially tested. Proceeding anyway."
      PKG_MANAGER="apt"
      ;;
    rhel|centos|rocky|almalinux)
      [[ "$OS_VERSION_ID" =~ ^(8|9) ]] || \
        warn "RHEL ${OS_VERSION_ID} is not officially tested. Proceeding anyway."
      PKG_MANAGER="dnf"
      ;;
    *)
      die "Unsupported OS: ${OS_ID}. KRON supports Ubuntu 20.04/22.04 and RHEL 8/9."
      ;;
  esac

  ARCH=$(uname -m)
  [[ "$ARCH" == "x86_64" ]] || die "KRON requires x86_64. Got: ${ARCH}"

  info "Detected: ${OS_ID} ${OS_VERSION_ID} (${ARCH})"
}

# ── Preflight checks ──────────────────────────────────────────────────────────

preflight() {
  [[ "$EUID" -eq 0 ]] || die "This installer must run as root (sudo)."

  # Minimum resources
  local mem_kb
  mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
  local mem_gb=$(( mem_kb / 1024 / 1024 ))

  case "$KRON_TIER" in
    nano)       local min_mem=4 ;;
    standard)   local min_mem=16 ;;
    enterprise) local min_mem=32 ;;
    *) die "Invalid tier: ${KRON_TIER}. Must be nano, standard, or enterprise." ;;
  esac

  if [[ $mem_gb -lt $min_mem ]]; then
    warn "Tier '${KRON_TIER}' recommends ${min_mem}GB RAM. This system has ${mem_gb}GB."
    warn "Performance may be degraded."
  fi

  local disk_gb
  disk_gb=$(df -BG "${KRON_DATA_DIR%/*}" 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G')
  if [[ "${disk_gb:-0}" -lt 50 ]]; then
    warn "Less than 50GB free on data disk. KRON requires at minimum 50GB."
  fi

  info "Preflight checks passed. Tier: ${KRON_TIER}, Data: ${KRON_DATA_DIR}"
}

# ── Install system dependencies ───────────────────────────────────────────────

install_deps() {
  info "Installing system dependencies..."

  if [[ "$PKG_MANAGER" == "apt" ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y --no-install-recommends \
      curl wget ca-certificates gnupg \
      jq unzip tar gzip \
      systemd \
      openssl
  else
    dnf install -y \
      curl wget ca-certificates gnupg2 \
      jq unzip tar gzip \
      systemd \
      openssl
  fi

  # Install mc (MinIO client) for backup operations
  if ! command -v mc >/dev/null 2>&1; then
    info "Installing MinIO client..."
    curl -fsSL "https://dl.min.io/client/mc/release/linux-amd64/mc" \
      -o /usr/local/bin/mc
    chmod +x /usr/local/bin/mc
  fi
}

# ── Resolve version ───────────────────────────────────────────────────────────

resolve_version() {
  if [[ -z "$KRON_VERSION" ]]; then
    info "Fetching latest KRON version..."
    KRON_VERSION=$(curl -fsSL \
      "https://api.github.com/repos/Hardik364/Kron/releases/latest" | \
      jq -r '.tag_name')
    [[ "$KRON_VERSION" != "null" ]] || die "Could not fetch latest version from GitHub."
  fi
  info "Installing KRON ${KRON_VERSION}"
}

# ── Download and verify binaries ──────────────────────────────────────────────

download_binaries() {
  local base_url="https://github.com/Hardik364/Kron/releases/download/${KRON_VERSION}"
  local target="x86_64-unknown-linux-musl"
  local tmp_dir
  tmp_dir=$(mktemp -d)
  trap "rm -rf ${tmp_dir}" EXIT

  info "Downloading KRON ${KRON_VERSION} binaries..."

  local services=(kron-collector kron-normalizer kron-stream kron-alert kron-auth kron-query-api kron-ctl)
  [[ "$KRON_TIER" != "nano" ]] && services+=(kron-soar kron-compliance kron-ai)

  # Download checksums
  curl -fsSL "${base_url}/checksums.sha256"        -o "${tmp_dir}/checksums.sha256"
  curl -fsSL "${base_url}/checksums.sha256.asc"    -o "${tmp_dir}/checksums.sha256.asc" 2>/dev/null || true

  # Download and verify each binary
  for svc in "${services[@]}"; do
    local bin="${svc}-${target}"
    local sig="${svc}-${target}.sig"

    curl -fsSL "${base_url}/${bin}" -o "${tmp_dir}/${bin}"
    curl -fsSL "${base_url}/${sig}" -o "${tmp_dir}/${sig}" 2>/dev/null || true

    # Verify checksum
    if grep -q "${bin}" "${tmp_dir}/checksums.sha256"; then
      (cd "${tmp_dir}" && sha256sum -c <(grep "${bin}" checksums.sha256)) || \
        die "Checksum verification failed for ${bin}"
      success "Verified: ${bin}"
    fi
  done

  # Install binaries
  mkdir -p "${KRON_BIN_DIR}"
  for svc in "${services[@]}"; do
    local bin="${svc}-${target}"
    install -m 755 "${tmp_dir}/${bin}" "${KRON_BIN_DIR}/${svc}"
    success "Installed: ${KRON_BIN_DIR}/${svc}"
  done
}

# ── Create system user and directories ───────────────────────────────────────

setup_system() {
  info "Setting up kron system user and directories..."

  # Create kron user (no login shell, no home directory except data dir)
  if ! id kron >/dev/null 2>&1; then
    useradd --system --no-create-home \
      --home-dir "${KRON_DATA_DIR}" \
      --shell /sbin/nologin \
      --comment "KRON SIEM" \
      kron
  fi

  mkdir -p \
    "${KRON_DATA_DIR}" \
    "${KRON_DATA_DIR}/models" \
    "${KRON_DATA_DIR}/rules" \
    "${KRON_INSTALL_DIR}" \
    "/etc/kron" \
    "/var/log/kron" \
    "/var/lib/node_exporter/textfile_collector"

  chown -R kron:kron "${KRON_DATA_DIR}" "/var/log/kron"
  chmod 750 "${KRON_DATA_DIR}"

  # Write version file
  echo "${KRON_VERSION}" > /etc/kron/version
}

# ── Generate base config ──────────────────────────────────────────────────────

generate_config() {
  local config_file="/etc/kron/config.toml"
  if [[ -f "$config_file" ]]; then
    warn "Config file ${config_file} already exists — not overwriting."
    return
  fi

  info "Generating base configuration..."

  local jwt_secret
  jwt_secret=$(openssl rand -hex 32)

  cat > "${config_file}" <<EOF
# KRON Configuration — generated by installer ${KRON_VERSION}
# Edit this file to customise your deployment.

[server]
mode = "${KRON_TIER}"
data_dir = "${KRON_DATA_DIR}"
bind = "0.0.0.0:3000"

[auth]
jwt_secret = "${jwt_secret}"
jwt_expiry_hours = 8
totp_enabled = true

[duckdb]
path = "${KRON_DATA_DIR}/kron.duckdb"

[clickhouse]
# Only used for Standard and Enterprise tiers
url = "http://localhost:8123"
database = "kron"
username = "kron"
password = "CHANGE_ME"

[redpanda]
# Only used for Standard and Enterprise tiers
brokers = ["localhost:9092"]

[notifications]
whatsapp_enabled = false
sms_enabled = false
email_enabled = false

[backup]
enabled = true
minio_endpoint = "http://localhost:9000"
minio_bucket = "kron-backups"
minio_access_key = "CHANGE_ME"
minio_secret_key = "CHANGE_ME"
EOF

  chmod 640 "${config_file}"
  chown root:kron "${config_file}"
  success "Config written to ${config_file} — review and edit before starting KRON."
}

# ── Install systemd units ─────────────────────────────────────────────────────

install_systemd() {
  info "Installing systemd service units..."

  local services=(kron-auth kron-collector kron-normalizer kron-stream kron-alert kron-query-api)

  for svc in "${services[@]}"; do
    cat > "/etc/systemd/system/${svc}.service" <<EOF
[Unit]
Description=KRON SIEM — ${svc}
Documentation=https://docs.kron.security
After=network.target
PartOf=kron.target

[Service]
Type=simple
User=kron
Group=kron
EnvironmentFile=-/etc/kron/env
ExecStart=${KRON_BIN_DIR}/${svc} --config /etc/kron/config.toml
Restart=always
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${svc}
# Hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${KRON_DATA_DIR} /var/log/kron /var/lib/node_exporter
PrivateTmp=yes
CapabilityBoundingSet=

[Install]
WantedBy=kron.target
EOF
  done

  # Meta target to start/stop all KRON services at once
  cat > "/etc/systemd/system/kron.target" <<EOF
[Unit]
Description=KRON SIEM
Documentation=https://docs.kron.security
Wants=${services[*]/%/.service}
After=${services[*]/%/.service}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  for svc in "${services[@]}"; do
    systemctl enable "${svc}.service"
  done
  systemctl enable kron.target

  success "Systemd units installed and enabled."
}

# ── Start services ────────────────────────────────────────────────────────────

start_services() {
  info "Starting KRON services..."
  systemctl start kron.target

  # Wait up to 30 seconds for health check to pass
  local attempts=0
  while [[ $attempts -lt 30 ]]; do
    if kron-ctl health 2>/dev/null | grep -q "all services healthy"; then
      success "KRON is running and healthy."
      return
    fi
    sleep 1
    (( attempts++ ))
  done

  warn "KRON started but health check did not pass within 30 seconds."
  warn "Check logs: journalctl -u kron-query-api -f"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  echo ""
  bold "  ██╗  ██╗██████╗  ██████╗ ███╗   ██╗"
  bold "  ██║ ██╔╝██╔══██╗██╔═══██╗████╗  ██║"
  bold "  █████╔╝ ██████╔╝██║   ██║██╔██╗ ██║"
  bold "  ██╔═██╗ ██╔══██╗██║   ██║██║╚██╗██║"
  bold "  ██║  ██╗██║  ██║╚██████╔╝██║ ╚████║"
  bold "  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝"
  echo ""
  bold "  KRON SIEM Installer — Tier: ${KRON_TIER}"
  echo ""

  detect_os
  preflight
  resolve_version
  install_deps
  download_binaries
  setup_system
  generate_config
  install_systemd

  if [[ $KRON_START -eq 1 ]]; then
    start_services
  fi

  echo ""
  success "KRON ${KRON_VERSION} installed successfully!"
  echo ""
  info "Next steps:"
  echo "  1. Edit /etc/kron/config.toml with your settings"
  echo "  2. Run: kron-ctl migration run"
  echo "  3. Run: kron-ctl health"
  echo "  4. Open https://$(hostname -I | awk '{print $1}'):3000 in your browser"
  echo ""
  info "Documentation: https://docs.kron.security"
  info "Support: support@kron.security"
  echo ""
}

main
