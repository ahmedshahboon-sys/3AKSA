# 3AKSA Security Operations Notes

## Existing application controls

3AKSA enforces trusted HTTPS web origins in Production, CSRF origin checks for cookie-authenticated unsafe requests, security headers, admin MFA, role checks, audit logs, request/body limits, route-specific rate limits, SSRF protections for TV imports, safe storage paths, and server-side Feature Flags.

Application rate limiting is not a substitute for network-edge DDoS protection. Volumetric attacks must be absorbed by the reverse proxy/provider/firewall layer before traffic reaches the 3AKSA API.

## Incident order

1. Preserve logs and note the deployed SHA/version.
2. Disable an affected optional feature using Feature Flags if that contains the incident.
3. Revoke exposed sessions/credentials and rotate only using the secret-rotation runbook.
4. For suspected data corruption, stop writes and take a verified retention-safe backup before repair.
5. Do not copy message contents, voice files, passwords, tokens, precise location or secret values into tickets/Telemetry.
6. Validate `/ready`, worker retention, auth, admin MFA, wallet integrity and two-account messaging before declaring recovery.

## Data-integrity priorities

Wallet ledger and purchases/gifts are durable financial records and must remain atomic/idempotent. Temporary messages and voice are intentionally disposable and must never be restored from long-lived backups. Usernames reserved after ban/deletion and blocked installation identifiers are durable abuse-prevention state.
