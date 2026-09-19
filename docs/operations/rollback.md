# 3AKSA Production Rollback Runbook

## Principle

Rollback must recover service without reintroducing expired private data. Do not improvise destructive SQL on Production.

## Before every deploy

1. Record the exact current Git SHA and deployed `APP_VERSION`.
2. Create and verify a retention-safe backup with `scripts/ops/backup.sh` and `verify-backup.sh`.
3. Confirm the previous known-good web/API/worker build and Android release metadata remain available.
4. Run `scripts/ops/release-preflight.sh`.
5. Confirm feature flags can disable optional TV, Store, paid features, Telemetry, and Push while Core remains available.

## Fast rollback — application code only

Use when schema/data are compatible and the regression is code-only:

1. Put the affected route behind maintenance/reverse-proxy protection if needed.
2. Deploy the last known-good Git SHA, not an uncommitted server copy.
3. Restart only 3AKSA services.
4. Verify `/health`, `/ready`, Socket.IO, worker logs, Web/PWA load, and one Android login.
5. Verify auth, room text, private text, and one wallet read.
6. Record the incident and rollback SHA.

## Migration/data rollback

Migrations are forward-only unless a reviewed down-path exists. Never manually delete columns/tables to imitate a rollback.

If the new schema or data is unsafe:
1. Enter maintenance mode.
2. Stop API writes and the worker.
3. Verify the pre-deploy backup.
4. Restore using `scripts/ops/restore.sh`.
5. Deploy the compatible known-good application SHA.
6. Run the compatible migration set.
7. Run security preflight and full readiness checks before reopening traffic.

Because backups intentionally exclude temporary messages, voice, exact Nearby location, live sessions and Push subscriptions, rollback cannot resurrect expired chat history.

## Optional-feature incident

Prefer a Feature Flag shutdown before a full rollback when the fault is isolated to TV, Store, paid features, Telemetry, or Push. This keeps authentication and core chat online.

## Stop conditions

Do not reopen public traffic if database/Redis/storage readiness is red, migrations are uncertain, the worker is not cleaning expiry, wallet integrity is uncertain, or the release cannot pass basic two-account QA.
