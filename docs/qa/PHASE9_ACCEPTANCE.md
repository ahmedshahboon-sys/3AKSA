# Phase 9 — QA & Release Hardening

This phase converts the V1 acceptance criteria into repeatable release gates.

## Automated gates

| Area | Gate |
| --- | --- |
| Shared Web/APK account | Register on a web installation, sign in from a separate Android installation, assert the same user id and simultaneous valid sessions. |
| Readiness | `/ready` must verify PostgreSQL, Redis and writable local storage and return 503 when dependencies are not ready. |
| Presence / room capacity | Existing realtime integration suite verifies disconnect cleanup, no ghost room count, and max-room capacity. |
| 24h message TTL | Existing realtime/private/voice suites assert exact per-message 24h expiry. |
| Physical voice cleanup | Worker integration test creates expired voice rows plus local files and requires both database rows and storage objects to be deleted. |
| Mutual blocking | Phase 9 acceptance verifies blocked users disappear from Nearby in both directions; existing private suite verifies messaging/history blocking. |
| Gender room policy | Phase 9 acceptance verifies server-side girls-only denial; existing realtime suite verifies boys-only denial. |
| Temporary room ban | Phase 9 acceptance verifies an active ban rejects join and an expired ban automatically allows access again. |
| Reserved username | Phase 9 acceptance requires `USERNAME_RESERVED`. |
| Blocked installation | Phase 9 acceptance requires `DEVICE_BLOCKED` during Android-style registration. |
| Admin authorization | A normal authenticated account must receive 403 from the admin surface. |
| Anti-spam | Existing rate-limit suites plus Phase 8 auth/admin limits remain regression-gated. |
| Web/PWA | Static release contract verifies RTL metadata, Readex Pro, main/light/dark/pink themes, safe areas, responsive breakpoints, base-path portability, service worker registration, API/socket cache exclusion and offline fallback. |
| Concurrent read smoke | 160 concurrent health/public-room HTTP requests must complete without 5xx and within the CI smoke budget. |
| Android | Phase 7 CI continues to build and upload a debug APK on every PR to `develop`. |

## Manual pre-production checks

These require a real release environment/device and are intentionally not faked by source-only CI:

- Android install/update over the final HTTPS production URL.
- Push permission prompts and delivery on at least one physical Android device.
- PWA install on Android and iOS.
- Visual pass at narrow mobile, normal phone and desktop widths.
- Weak-network behavior using browser/device throttling.
- Background/foreground notification behavior.
- Production backup/restore and rollback drill.
- Signed release APK verification after the signing key is supplied through the trusted release path.

No production deployment is performed by Phase 9.
