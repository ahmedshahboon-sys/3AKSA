# 3AKSA Secret Rotation Runbook

Production secrets are external to Git. Generate independent high-entropy values; the application now rejects required secrets shorter than 32 characters, placeholder-looking values, or duplicate values across security roles.

## SESSION_SECRET

Rotate during a controlled maintenance window. Expect existing authenticated sessions/tokens to become invalid where they depend on the old secret. Verify login, logout, cookie sessions, bearer sessions and CSRF behavior after restart.

## PASSWORD_PEPPER

Do **not** replace this blindly. Current password hashes depend on the pepper. Direct replacement can make every existing password unverifiable.

A pepper rotation requires a reviewed migration strategy (for example dual old/new verification with rehash-on-success) before changing the production value. Until such a migration exists, preserve the current pepper in the secret manager and incident backups.

## ADMIN_MFA_ENCRYPTION_KEY

Do **not** replace this blindly. Existing MFA secrets are AES-GCM encrypted with a key derived from this value. A direct change makes enrolled MFA secrets unreadable.

Rotation requires either a reviewed re-encryption procedure while the old key is available, or controlled MFA re-enrollment for staff. Verify Super Admin MFA before ending maintenance.

## PUSH_ENCRYPTION_KEY

Rotating this can make stored encrypted Push subscription payloads unreadable. The safe fallback is to disable Push with the Feature Flag, rotate the key, clear invalid subscriptions, then let clients subscribe again. Core chat must remain available throughout.

## VAPID / FCM credentials

Rotate provider credentials in the external secret store. Configure complete credential sets only; the production preflight rejects partial Web Push or FCM configurations. Test delivery with a non-production/test account.

## OWNER_CLAIM_SECRET

Treat as one-time bootstrap material. Remove/rotate it after owner bootstrap according to the deployment procedure. Never commit it or paste it into logs.

## Rotation checklist

1. Backup/verify durable state.
2. Disable the affected optional feature where possible.
3. Change one secret family at a time.
4. Run API security preflight before restart.
5. Restart only affected 3AKSA services.
6. Verify `/ready`, authentication, MFA/admin access and relevant integrations.
7. Re-enable optional feature.
8. Record date/operator/reason in the private operations log; never record the secret value.
