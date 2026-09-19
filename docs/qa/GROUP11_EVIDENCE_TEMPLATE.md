# Group 11 — Non-Secret Evidence Template

Do not record passwords, tokens, exact GPS coordinates, phone numbers, MFA secrets, owner activation secrets, database credentials, private message contents or raw voice content.

## Build / environment

- Production URL:
- Deployed Git SHA:
- APP_VERSION:
- Test date/time UTC:
- Android APK versionName/versionCode:
- APK SHA-256:
- Signing certificate SHA-256:
- Android device model:
- Android version / SDK:
- PWA Android browser/version:
- PWA iOS device/browser/version:

## Production readiness

- [ ] Public /health PASS
- [ ] Public /ready PASS
- [ ] Socket.IO handshake PASS
- [ ] API container healthy
- [ ] Worker running and retention audit PASS
- [ ] Backup verification PASS
- [ ] Owner ahmed active with Admin MFA
- [ ] Owner bootstrap disabled

## Physical Android

- [ ] Cold start PASS
- [ ] Login PASS
- [ ] Post-login Home stable
- [ ] Background/foreground PASS
- [ ] Force-close/reopen PASS
- [ ] No fatal/ANR in app-scoped evidence
- Local evidence directory/reference:

## Two-account matrix

- [ ] Same account Web + Android identity/session
- [ ] Friends lifecycle
- [ ] Room text both directions
- [ ] Room voice both directions
- [ ] Presence join/leave recovery
- [ ] Boys/girls room enforcement
- [ ] Private room invite/revoke
- [ ] Room moderation/ban
- [ ] Private text + voice
- [ ] Mutual block behavior
- [ ] Report
- [ ] Nearby consent/filter/distance
- [ ] Store/cosmetics when enabled
- [ ] Rose split when enabled/test-funded
- [ ] TV when enabled
- [ ] Feature-flag Core isolation

## Install / resilience

- [ ] Public APK download hash matches
- [ ] Signed APK update path
- [ ] Android PWA install
- [ ] iOS PWA install
- [ ] Offline recovery
- [ ] Weak-network recovery
- [ ] Permission denial/re-grant
- [ ] Basic TalkBack/keyboard accessibility

## Defects

For each defect record severity, reproducible steps, app version/SHA, and sanitized evidence reference.

- P0:
- P1:
- P2/P3:

## Gate

- [ ] No open P0
- [ ] No open P1
- [ ] Release candidate accepted for Group 12

Tester:
Date:
