# KRON

India's first on-premise SIEM platform. Runs on ₹30,000 servers. Alerts on WhatsApp in Hindi.

## Overview

KRON is a production-grade security information and event management (SIEM) platform
built specifically for the Indian market. It runs entirely on-premise with zero telemetry
leaving the organization — air-gap capable.

- **Deployment tiers:** Nano (8GB RAM, free), Standard (16-32GB, ₹8-25K/mo), Enterprise (custom)
- **Compliance:** CERT-In, RBI, DPDP Act, SEBI CSCRF built-in
- **Detection:** 3,000+ SIGMA rules + India-specific threat pack + ONNX ML models
- **Alerts:** WhatsApp Business API with Hindi summaries and action buttons

## Documentation

See [docs/](docs/) for full product documentation.

## Setup

### Prerequisites

- Rust 1.75+ (`rustup toolchain install stable`)
- Docker and Docker Compose v2
- `cargo-audit` and `cargo-deny` (`cargo install cargo-audit cargo-deny`)
- Python 3 for pre-commit hooks (`pip install pre-commit`)

### Development environment

```bash
cp .env.dev.example .env.dev
# Edit .env.dev with your preferred passwords

./scripts/dev-up.sh
```

This starts:
- ClickHouse at `http://localhost:8123`
- Redpanda at `localhost:9092`
- MinIO at `http://localhost:9000` (console: `http://localhost:9001`)
- Prometheus at `http://localhost:9090`
- Grafana at `http://localhost:3000`

### Build

```bash
cargo build --workspace
```

### Test

```bash
cargo test --workspace --lib                          # unit tests
cargo test --workspace -- --include-ignored integration  # integration tests (requires dev env)
```

### Install pre-commit hooks

```bash
pre-commit install
```

## Architecture

See [docs/Architecture.md](docs/Architecture.md) for the full system design.

## Build phases

See [PHASES.md](PHASES.md) for the current build phase and task checklist.

## Engineering guidelines

See [CLAUDE.md](CLAUDE.md) for coding standards and prime directives.

## License

Apache-2.0
