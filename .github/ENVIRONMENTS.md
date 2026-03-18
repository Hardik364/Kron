# GitHub Environments & Branch Strategy

## Branch Strategy

```
feature/your-feature
        │
        │  PR → qa
        ▼
       qa  ──────────────────→  QA Environment (auto-deploy)
        │
        │  PR → main (after QA sign-off)
        ▼
      main  ─────────────────→  Production Environment (manual approval)
        │
        │  git tag v1.x.x
        ▼
     v1.x.x ────────────────→  GitHub Release + signed binaries
```

### Rules

| Branch | Purpose | Who merges here |
|--------|---------|----------------|
| `feature/*` | Development | Developer creates, PRs into `qa` |
| `qa` | QA integration | Feature PRs merge here |
| `main` | Production | Only `qa` merges here, after QA sign-off |

**Never commit directly to `main`.** Always go through `qa` first.

---

## Workflow → Environment mapping

| Workflow | Trigger | Environment | Approval |
|----------|---------|-------------|---------|
| `ci.yml` | Push to `qa` or `main`, any PR to either | — | None (quality gate) |
| `qa.yml` | Push to `qa` | `qa` | None (auto) |
| `release.yml` | Push to `main` | `production` | **Manual approval required** |
| `release.yml` | Push tag `v*` | `production` | Manual approval + builds signed binaries + GitHub Release |

---

## GitHub Environments Setup (Manual — do once)

### Environment: `qa`

1. Go to **Settings → Environments → New environment**
2. Name: `qa`
3. No protection rules needed
4. No secrets needed (uses `GITHUB_TOKEN` for GHCR)

### Environment: `production`

1. Go to **Settings → Environments → New environment**
2. Name: `production`
3. **Required reviewers**: add `Hardik364` (and any co-approvers)
4. **Deployment branches and tags**: select "Protected branches"
   - Add branch rule: `main`
   - Add tag rule: `v*`
5. **Environment secrets** (add here, NOT at repo level):
   - `COSIGN_PRIVATE_KEY` — cosign private key (from `cosign.key` file content)
   - `COSIGN_PASSWORD` — password set when generating the cosign key pair

---

## Branch Protection Rules (Manual — do once)

### Protect `qa` branch

Settings → Branches → Add rule:
- Pattern: `qa`
- ✅ Require a pull request before merging
- ✅ Require status checks: `check`, `fmt`, `clippy`, `test`
- ✅ Require branches to be up to date

### Protect `main` branch

Settings → Branches → Add rule:
- Pattern: `main`
- ✅ Require a pull request before merging
- ✅ Require approvals: 1
- ✅ Require status checks: `check`, `fmt`, `clippy`, `test`, `audit`, `deny`
- ✅ Require branches to be up to date
- ✅ Do not allow bypassing

---

## Image tags produced

| Event | Images tagged as |
|-------|-----------------|
| Push to `qa` | `qa-{sha}`, `qa-latest` |
| Push to `main` | `main-{sha}`, `latest` |
| Push tag `v1.2.3` | `1.2.3`, `1.2`, `latest` + signed binaries |

---

## Generating cosign keys (one-time setup)

```bash
# Install cosign: https://docs.sigstore.dev/cosign/system_config/installation/
cosign generate-key-pair

# Creates cosign.key (PRIVATE — never commit) and cosign.pub (public — commit this)
# Add cosign.key content as COSIGN_PRIVATE_KEY in production environment secrets
# Add the password you chose as COSIGN_PASSWORD
```

Commit `cosign.pub` to the repository — customers use it to verify downloaded binaries:

```bash
cosign verify-blob \
  --key cosign.pub \
  --signature kron-collector-x86_64-unknown-linux-musl.sig \
  kron-collector-x86_64-unknown-linux-musl
```
