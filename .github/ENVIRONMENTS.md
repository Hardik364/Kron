# GitHub Environments Setup

After pushing this repository, configure the following GitHub Environments
in **Settings → Environments** before merging any PR to `main`.

## Environment: `qa`

- **Trigger**: Automatic on every push to `main`
- **Protection rules**: None (auto-deploy)
- **Secrets**: None required (uses `GITHUB_TOKEN` for GHCR)

**Create**: Settings → Environments → New environment → `qa`
No additional configuration needed.

## Environment: `production`

- **Trigger**: Manual approval required on tag push `v*`
- **Protection rules**:
  - Required reviewers: Add `Hardik364` (and any other approvers)
  - Deployment branches: Protected tags matching `v*`
- **Secrets** (add to this environment, NOT repo-level):
  - `COSIGN_PRIVATE_KEY` — cosign private key for binary signing
  - `COSIGN_PASSWORD` — password for the cosign key

**Create**: Settings → Environments → New environment → `production`
- Check "Required reviewers", add yourself
- Under "Deployment branches and tags", select "Protected branches" → add tag rule `v*`
- Add the two secrets above

## Branch Protection: `main`

Settings → Branches → Add branch protection rule:

- Branch name pattern: `main`
- ✅ Require a pull request before merging
- ✅ Require approvals (set to 0 for solo development)
- ✅ Require status checks to pass before merging
  - Required checks: `check`, `fmt`, `clippy`, `test`, `audit`, `deny`
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

## Generating cosign keys

```bash
# Install cosign: https://docs.sigstore.dev/cosign/system_config/installation/
cosign generate-key-pair

# This creates cosign.key (private) and cosign.pub (public)
# Add cosign.key content as COSIGN_PRIVATE_KEY secret
# Add cosign password as COSIGN_PASSWORD secret
# Commit cosign.pub to the repository (it is public)
```

## Image registry

Images are pushed to GitHub Container Registry (GHCR):
- QA: `ghcr.io/hardik364/kron/{service}:qa-{sha}`
- Production: `ghcr.io/hardik364/kron/{service}:{version}`

Pull on customer hardware:
```bash
docker pull ghcr.io/hardik364/kron/kron-collector:1.0.0
```
