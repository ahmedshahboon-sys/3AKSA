# FINAL LAUNCH TRACKER — 3AKSA | عكسة

Last updated: 2026-09-19

Status legend: `NOT STARTED` · `IN PROGRESS` · `DONE` · `BLOCKED` · `DEFERRED` · `BLOCKED_EXTERNAL`

## Release baseline

| Item | State | Evidence / notes |
|---|---|---|
| develop SHA | DONE | `c3266dd988b9d9ac38075c8d28ac2445db7ed172` |
| main SHA | DONE | `a64d770004017422c2c8bc4dd94149b3e7691959` |
| main vs develop | DONE | develop is 62 commits ahead, 0 behind |
| open PRs | DONE | No open PRs returned at baseline |
| CI / CodeQL | IN PROGRESS | Workflow definitions exist; current develop SHA has no PR-triggered workflow runs returned by connector |
| Dependabot | IN PROGRESS | `.github/dependabot.yml` exists; alerts require repository security state inspection |
| Production HTTP | BLOCKED_EXTERNAL | Execution environment cannot resolve `marbo3a.ly`; production verification must be completed from server/runtime network |
| PostgreSQL | BLOCKED_EXTERNAL | Requires production/server runtime access |
| Redis | BLOCKED_EXTERNAL | Requires production/server runtime access |
| Storage | BLOCKED_EXTERNAL | Requires production/server runtime access |
| Worker | BLOCKED_EXTERNAL | Requires production/server runtime access |
| Android physical device | BLOCKED_EXTERNAL | Requires physical Android device + logcat |
| Official Android signing material | IN PROGRESS | Workflow support exists; signing key availability must be verified outside Git |

## Implementation / behavior audit

| Area | Status | Current classification |
|---|---|---|
| Auth / owner bootstrap | IN PROGRESS | Implemented in code; production/bootstrap still unverified |
| Core API / health | IN PROGRESS | Implemented in code; production behavior unverified |
| Rooms / realtime | IN PROGRESS | Implemented/partial; requires final behavior audit |
| Social / block / report | IN PROGRESS | Implemented/partial; requires final UI + behavior audit |
| Economy / store | IN PROGRESS | Implemented/partial; requires final visual + idempotency audit |
| TV | IN PROGRESS | Implemented/partial; requires admin/UI + SSRF/import audit |
| Prayer | IN PROGRESS | Implemented; requires user-journey validation |
| Notifications / push | IN PROGRESS | Implemented/partial; external credentials optional |
| PWA | IN PROGRESS | Manifest exists; install/service-worker behavior requires final audit |
| Android | IN PROGRESS | SecureStore fix exists; P0 post-login stability still requires physical proof |
| Admin / security | IN PROGRESS | Implemented/partial; break-glass/MFA and final authorization audit pending |
| Retention | IN PROGRESS | Worker/migrations exist; exact row/file expiry behavior pending proof |

## Groups

### GROUP 0 — BASELINE & REAL STATE AUDIT
Status: **BLOCKED_EXTERNAL** (source/CI baseline complete; production runtime checks unavailable from this execution network)

- [x] Verify develop SHA.
- [x] Verify main SHA.
- [x] Compare main/develop.
- [x] Inspect open PRs.
- [x] Confirm package manager and principal app packages.
- [x] Confirm PWA manifest exists.
- [x] Confirm CI/CodeQL gates on PR #20: Phase 1–11 applicable workflows, CodeQL and Android Release Candidate all passed.
- [x] Confirm migration inventory through `0019_owner_bootstrap.sql` (19 migrations in Git; production-applied state remains external).
- [x] Confirm Android release-candidate versionName `1.0.1`, versionCode `2`.
- [ ] Confirm Production APP_VERSION, /health, /ready, API, Socket.IO, service worker and Nginx subpath.
- [ ] Classify all launch-critical areas as Implemented / Partial / Missing / Broken.

Files changed:
- `docs/qa/FINAL_LAUNCH_TRACKER.md`

Tests:
- Git branch/commit comparison through GitHub.
- Static source inspection.

Current blockers:
- Production/server network and physical-device checks are external to this connector session.

### GROUP 1 — ANDROID P0 STABILITY
Status: **BLOCKED_EXTERNAL** (code/CI closure complete; physical-device/logcat proof remains external)

Merged:
- PR #21 → `develop` at `abe32d83f5822149525e86393e674f410791ac75`.
- Phase 1–11 applicable CI, CodeQL and Android Release Candidate: PASS.

Changes:
- Top-level React Error Boundary.
- Native push fail-safe; no permission prompt during core startup.
- Native app-link/app-info fail-safe.
- Generated Android manifest permission contract for microphone, location and notifications.
- CI regression gate for startup safety.

Physical-device crash closure remains `BLOCKED_EXTERNAL` until a real Android device/logcat run is supplied.

### GROUP 2 — AUTH / RECOVERY / DEVICES / SESSIONS
Status: **BLOCKED_EXTERNAL** (code/CI complete; production migration verification remains external)

Changes:
- Unified password policy across registration/admin/recovery: 8–128 chars with at least one Unicode letter and one number.
- Non-enumerating recovery requests with rate limits and expiry.
- MFA-protected Super Admin approval/rejection with one-time recovery code.
- Recovery token stored only as SHA-256 hash; single-use confirmation revokes old sessions and creates one new session.
- User “أجهزتي” API/UI with current-device awareness, device-specific revoke, and revoke-all-other-sessions.
- Added migration `0020_auth_recovery.sql`.
- Added Phase 2 integration coverage for recovery and device/session revocation.

Closure:
- PR #22 merged to develop at `14fd18cf8985c8a99dcb86da29c2fa7e189dd747`.
- Phase 1–11 applicable CI, CodeQL and Android Release Candidate: PASS.
- Production migration state remains external.

### GROUP 3 — SOCIAL / FRIENDS / BLOCK / REPORT
Status: **IN PROGRESS**

Changes:
- Typed incoming/outgoing friend request lifecycle, accept/reject/cancel/remove-friend APIs.
- Friends management UI and blocked-users management.
- User profile actions for friend request, private message, block and report.
- Block/report entry points from Nearby, Private, and room-member messages.
- Authenticated rate-limit identity uses the session rather than shared NAT IP, with a separate IP flood ceiling.
- Existing backend block behavior cancels friendship/pending requests and hides profiles in both directions.

Pending:
- Regression contract + CI/CodeQL.
- Production/two-account behavior verification remains external.

### GROUP 4 — ROOMS + ROOM ADMIN + TV
Status: **NOT STARTED**

### GROUP 5 — WALLET / STORE / GIFTS / VISUAL ITEMS
Status: **NOT STARTED**

### GROUP 6 — PWA / APK / PUSH / DISTRIBUTION
Status: **NOT STARTED**

### GROUP 7 — PRIVACY / SETTINGS / I18N / TELEMETRY / FEATURE FLAGS
Status: **NOT STARTED**

### GROUP 8 — UX / ACCESSIBILITY / RESPONSIVE / RESILIENCE
Status: **NOT STARTED**

### GROUP 9 — SECURITY / DATA INTEGRITY / OPERATIONS
Status: **NOT STARTED**

### GROUP 10 — PRODUCTION DEPLOYMENT & OWNER BOOTSTRAP
Status: **BLOCKED_EXTERNAL**

### GROUP 11 — FINAL TWO-ACCOUNT + PHYSICAL DEVICE QA
Status: **BLOCKED_EXTERNAL**

### GROUP 12 — RELEASE CLOSURE & PUBLIC BETA
Status: **NOT STARTED**

## Rule
A group is never marked DONE from file existence alone. Launch-critical behavior requires automated proof and, where specified, production/physical-device evidence.
