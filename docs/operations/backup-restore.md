# 3AKSA Backup & Restore Runbook

## Scope

3AKSA treats PostgreSQL as the durable source of truth and local storage as durable only for Store assets and Android releases. Redis is runtime/cache/presence state and is not authoritative.

Temporary/private data must not become permanent through backups. The supported backup script deliberately excludes:
- `room_messages`, `private_messages`, and `message_reactions`.
- Notifications and delivery rows.
- Telemetry events.
- Exact Nearby location rows.
- Active sessions, pending recovery requests, pending MFA enrollment, and push subscriptions.
- The entire `voice/` storage directory.

Durable `store/` and `releases/` storage is included.

## Create a backup

Run as the restricted 3AKSA service/operator user with production environment variables loaded:

```bash
export BACKUP_ROOT=/var/backups/3aksa
bash scripts/ops/backup.sh
```

Backups are created with restrictive permissions and contain `database.dump`, `durable-storage.tar`, `metadata.txt`, and `SHA256SUMS`.

Immediately verify:

```bash
bash scripts/ops/verify-backup.sh /var/backups/3aksa/<timestamp>
```

Copy backups to a protected off-server location. Do not place dumps, archives, secrets, or signing material in Git.

## Restore drill

A restore is destructive. Test it against a disposable/staging PostgreSQL database first.

```bash
export DATABASE_URL='postgresql://.../3aksa_restore_test'
export STORAGE_LOCAL_ROOT='/srv/3aksa-restore/storage'
export RESTORE_CONFIRM=RESTORE_3AKSA
bash scripts/ops/restore.sh /var/backups/3aksa/<timestamp>
```

For a production restore, maintenance mode and a separately verified backup are mandatory. The script additionally requires:

```bash
export NODE_ENV=production
export ALLOW_PRODUCTION_RESTORE=I_UNDERSTAND_THIS_REPLACES_PRODUCTION
```

After restore: run migrations, production security preflight, API `/ready`, worker health, login with two test accounts, room/private text+voice tests, wallet balance checks, and Android/PWA smoke tests before reopening traffic.

Restore intentionally leaves ephemeral message/history/location/session/push tables empty. Users may need to sign in and re-enable Push again.

## Retention audit

Run periodically and after worker incidents:

```bash
bash scripts/ops/retention-audit.sh
```

Expired rows should drain toward zero while the cleanup worker is healthy. A Telemetry event exceeding its hard 24-hour invariant or a voice file older than 25 hours is treated as an operational failure requiring investigation.
