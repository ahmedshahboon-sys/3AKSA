# Phase 10 — Production Security & Release Closure

## Current trial topology

The approved first trial is:

- Public Web/PWA: `https://marbo3a.ly/3aksa/`
- API: `https://marbo3a.ly/3aksa/api`
- Socket.IO: `https://marbo3a.ly/3aksa/socket.io`
- API and Worker remain independent services with their own database/auth/runtime.
- Android remains a separate application and points to the same 3AKSA API.

Moving to a dedicated 3AKSA domain later changes public URL/environment/Nginx values; it does not require merging the 3AKSA codebase into MARBO3A.

## Security closure completed in source

- Browser sessions use an HttpOnly, SameSite=Strict cookie instead of persisting bearer tokens in localStorage.
- Cookie-authenticated unsafe requests require an approved Origin.
- Cookie-authenticated Socket.IO handshakes require an approved Origin.
- Android bearer tokens are encrypted with an Android Keystore-backed AES/GCM key.
- Android uses a device-scoped identifier derived from Android ID and package identity instead of a clearable localStorage installation id.
- Generated Android builds disable application backup and cleartext traffic.
- Fastify trusts forwarding headers only from loopback Nginx.
- API security headers and a hardened static Nginx example are included.
- Production startup fails closed when critical secret/origin/storage settings are unsafe or missing.
- A committed pnpm lockfile plus frozen CI installs make dependency resolution deterministic.
- Dependabot, dependency audit and CodeQL scanning are enabled.
- Signed APK release builds are manual-only and require GitHub Secrets; signing material is never committed.

## Important limitation of the temporary /3aksa path

`marbo3a.ly/3aksa/` shares the same browser origin as the main MARBO3A site.

HttpOnly cookies stop JavaScript from reading the 3AKSA session token, but an XSS vulnerability anywhere on the same `marbo3a.ly` origin could still send authenticated same-origin requests to `/3aksa/api`.

This is acceptable for the requested controlled trial only if MARBO3A itself is kept trusted and patched. A dedicated 3AKSA domain (or at least a dedicated subdomain with separate cookies/origin) provides stronger browser isolation and remains the preferred public-launch topology.

## External steps still required before a real public release

These cannot be safely committed to a public repository:

1. Protect `main` in GitHub and require PR/checks before the first release merge.
2. Create the dedicated unprivileged Linux user and protected `/etc/3aksa/3aksa.env`.
3. Generate real random production values for SESSION_SECRET, PASSWORD_PEPPER, ADMIN_MFA_ENCRYPTION_KEY and PUSH_ENCRYPTION_KEY.
4. Configure real VAPID/FCM credentials if push is enabled.
5. Store the Android signing keystore and passwords only as trusted release secrets/offline backup.
6. Create and verify PostgreSQL/storage backups and perform a restore drill.
7. Review the existing MARBO3A Nginx server block before adding the isolated `/3aksa/` locations.
8. Run the physical-device/PWA/weak-network checks documented in Phase 9.
9. Do not enable the host-wide HSTS header from the 3AKSA snippet until MARBO3A.LY is confirmed HTTPS-only.

No production server change or deployment is performed automatically by Phase 10.
