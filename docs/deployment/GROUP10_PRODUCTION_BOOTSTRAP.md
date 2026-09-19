# Group 10 — Production Deployment & Owner Bootstrap

This runbook is the authoritative first-production procedure for the temporary launch at `https://marbo3a.ly/3aksa/`.

## Safety boundary

3AKSA stays independent from MARBO3A. The deployment joins the existing Docker network only to reach PostgreSQL/Redis, uses its own PostgreSQL database/user, Redis namespace, storage path, public web directory and loopback API port.

Do not execute these commands from an uncommitted server tree. Deploy only a reviewed SHA that has passed all required GitHub checks.

## 1. Pre-deployment

From the checked-out release candidate:

```bash
git status --short
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm verify
sudo bash scripts/ops/backup.sh
```

Verify the created backup with `scripts/ops/verify-backup.sh`.

## 2. Deploy

```bash
sudo bash infra/server/deploy-trial.sh
```

The script creates isolated DB state/secrets if needed, builds the immutable server image, runs the Production security preflight, applies migrations, builds Web/PWA for `/3aksa/`, starts API+worker, validates local readiness, installs the reviewed Nginx snippet, and runs the public production smoke.

Production secrets are stored under `/etc/3aksa/` and are never printed by the deployment script.

Existing production environments are preserved: the deploy helper never rotates an existing session secret/password pepper/MFA key just to enable owner bootstrap. If active `ahmed` already exists, it does not reopen the claim path; if the stored owner username differs from `ahmed`, the helper fails closed instead of silently changing ownership.

## 3. Bootstrap owner account `ahmed`

The first production env enables one-time owner bootstrap for username `ahmed`. The activation code is stored only on the server:

```bash
sudo cat /etc/3aksa/owner-claim-secret
```

Open `https://marbo3a.ly/3aksa/`, choose Register, enter username exactly `ahmed`, and use that server-side activation code when the Owner activation field appears.

The backend grants:
- `super_admin`
- `tv_admin`
- `moderation_admin`
- `finance_admin`
- `release_admin`

Immediately configure Admin MFA from the Admin surface.

Then disable the one-time owner bootstrap:

```bash
cd /opt/3aksa
sudo bash infra/server/disable-owner-bootstrap.sh
```

The shutdown script refuses to remove the claim secret unless active user `ahmed` exists and has all required staff roles. It removes the claim secret from the environment/file and restarts only the 3AKSA API, requiring readiness before success.

## 4. Production verification

```bash
bash infra/server/verify-production.sh
docker compose -f infra/docker/compose.server.yml ps
docker compose -f infra/docker/compose.server.yml logs --tail=100 api worker
bash scripts/ops/retention-audit.sh
```

Required green checks:
- public `/health`
- public `/ready`
- Web/PWA shell at `/3aksa/`
- public `/download`
- Socket.IO polling handshake
- security headers
- API/worker containers healthy/running
- retention worker drains expired data

## 5. Evidence to record

Record only non-secret evidence:
- deployed Git SHA
- `APP_VERSION`
- deployment time UTC
- API/worker container state
- health/readiness response
- owner role count and MFA enabled state (never MFA secret)
- Nginx backup path
- backup timestamp + SHA verification result

Do not paste `/etc/3aksa/3aksa.env`, database password, owner claim code, tokens, password hashes, MFA secrets, signing keys or Push credentials into chat/tickets.

## Rollback

For a bad Nginx integration:

```bash
sudo bash infra/server/rollback-nginx.sh
```

For an application regression, follow `docs/operations/rollback.md`. Do not roll back schema by hand.
