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
- [x] Confirm migration inventory through `0021_public_cosmetics_view.sql` (21 migrations in Git; production-applied state remains external).
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
Status: **BLOCKED_EXTERNAL** (code/CI complete; production/two-account verification remains external)

Changes:
- Typed incoming/outgoing friend request lifecycle, accept/reject/cancel/remove-friend APIs.
- Friends management UI and blocked-users management.
- User profile actions for friend request, private message, block and report.
- Block/report entry points from Nearby, Private, and room-member messages.
- Authenticated rate-limit identity uses the session rather than shared NAT IP, with a separate IP flood ceiling.
- Existing backend block behavior cancels friendship/pending requests and hides profiles in both directions.

Closure:
- PR #23 merged to develop at `27280182e82968d0e895029b220b31e29975d8f0`.
- Phase 1–11 applicable CI, CodeQL and Android Release Candidate: PASS.
- Production/two-account behavior verification remains external.

### GROUP 4 — ROOMS + ROOM ADMIN + TV
Status: **BLOCKED_EXTERNAL** (code/CI complete; production/two-account behavior remains external)

Changes:
- Added manager-only room management snapshot with current moderators, active bans and active private-room invites.
- Added owner room editing for name, description, visibility, gender policy, max users and open/closed state.
- Added moderator add/remove UI for room owners.
- Added permanent/timed room bans with reasons and unban controls.
- Added private-room invite create/revoke UI with expiry choices.
- Existing Redis presence enforcement verified: unique-user max capacity, heartbeat TTL, disconnect/leave cleanup.
- Added complete TV Admin UI: channel list/add/edit/publish/hide/delete/delete-all, manual/alphabetical ordering, search/group filtering, M3U/M3U8 paste/file/URL import, rights attestation and import history.
- Existing TV backend SSRF/DNS/private-address guards and playlist size/channel limits retained.
- Room TV owner/moderator controls remain viewer read-only.

Closure:
- PR #24 merged to develop at `ef44fd88bd638976824e9a8958ac8768957f27df`.
- Phase 1–11 applicable CI, CodeQL and Android Release Candidate: PASS.
- Production/two-account behavior verification remains external.

### GROUP 5 — WALLET / STORE / GIFTS / VISUAL ITEMS
Status: **BLOCKED_EXTERNAL** (code/CI complete; production/two-account economy behavior remains external)

Changes:
- Kept existing atomic/idempotent wallet, purchase and gift ledger; rose remains exactly 1.000 LYD with 0.500 LYD recipient and 0.500 LYD platform.
- Added MFA-protected Store Admin API/UI for create/update/publish/hide/retire and audited actions.
- Added validated Store asset upload: 1MB limit, signature sniffing, image/audio type separation, random internal storage keys and safe public asset serving.
- Added migration `0021_public_cosmetics_view.sql` to project equipped frame/badge/entry-sound identifiers.
- Frames and badges now propagate through profiles, friends, Nearby, private peers/messages and room messages and render on the shared Avatar.
- Equipped room entry sounds are emitted on first presence join and obey mute/room-sound preferences plus cooldown.
- Owned sticker-pack metadata is available as a text/sticker picker in Rooms and Private; no user image upload was added.
- Gifts can be sent from Profile and Private; rose split is disclosed exactly in the UI.
- Paid reaction Store items can be sent against Room/Private messages through the existing retry-safe gift ledger context.
- Added `tests/group5-economy-store-visuals.test.mjs`.

Closure:
- PR #25 merged to develop at `79d229d38ef2d6cbca588cff37e9b936410610eb`.
- Phase 1–11 applicable CI, CodeQL and Android Release Candidate: PASS after rate-limit review closure.
- Production migration/asset storage/two-account economy behavior remains external.

### GROUP 6 — PWA / APK / PUSH / DISTRIBUTION
Status: **BLOCKED_EXTERNAL** (code/CI complete; signing secrets and production install proof remain external)

Changes:
- Added server-side APK storage validation, 64MB limit, APK/ZIP manifest check, random storage key and server-computed SHA-256.
- Added MFA-protected `release_admin/super_admin` Release Management API/UI: upload draft, edit minimum version, publish and retire with audit + user/IP rate limits.
- Added public `/download` page that works before/after login and shows Stable/Beta version, size, SHA-256, release notes and APK download.
- Added PWA install prompt support plus iPhone Share → Add to Home Screen instructions.
- Explicit PWA manifest `any` and `maskable` icon purposes.
- Trusted Release now verifies source contracts, signs APK with external GitHub secrets, verifies certificate and retains APK + SHA256 + certificate proof artifacts.
- Existing Web Push VAPID and Android FCM providers remain optional; missing credentials do not break Core.
- Added `tests/group6-distribution.test.mjs`.

Closure:
- PR #26 merged to develop at `d13d1787cc635138c5e6d70181ea38f9e21fe5df`.
- Phase 1–11 applicable CI, CodeQL, Phase 7 debug APK and Android Release Candidate: PASS.
- Official Android signing secrets availability is external.
- Real VAPID/FCM credentials are external and optional for Core.
- Production install/download behavior remains external.

### GROUP 7 — PRIVACY / SETTINGS / I18N / TELEMETRY / FEATURE FLAGS
Status: **COMPLETE**

Changes:
- Added public Privacy Policy, Terms, About and Support pages available before login.
- Added persisted Arabic/English language preference and a real English auth/shell navigation path.
- Added privacy settings for profile visibility and explicit Nearby consent; friends-only visibility is enforced server-side.
- Added self-service account deletion with current-password verification, strong DELETE confirmation, username reservation, known-installation blocking, session revocation, push disable and owner-account protection.
- Added server-driven Feature Flags for TV, Store, paid features, Telemetry and Push with safe OFF defaults when flag state cannot be loaded.
- Feature flags now gate TV, Store/Purchases, paid gifts/reactions and Push APIs while leaving Core auth/chat available.
- Added bounded client Telemetry queue (max 50), ~15 minute best-effort sync and React/window error capture.
- Telemetry backend accepts a strict technical-context whitelist only, strips query/fragment from routes, rate-limits ingest and retains events for no more than 24 hours.
- Worker now deletes expired Telemetry in the same cleanup cycle as ephemeral messages/notifications.
- Added MFA/rate-limited Admin Feature Flag controls and aggregated 24h Telemetry dashboard.
- Added migration `0022_privacy_observability_flags.sql` and `tests/group7-privacy-observability.test.mjs`.

Closure:
- PR #27 merged to develop at `1d8f2c7bffa0485474562d920ba6b9ecf2445787`.
- All applicable Phase CI, Phase 9 QA, CodeQL Security and Android Release Candidate: PASS.
- Production migration/worker/privacy behavior remains external.

### GROUP 8 — UX / ACCESSIBILITY / RESPONSIVE / RESILIENCE
Status: **COMPLETE**

Group 8 implementation notes:
- Home uses partial-success loading so rooms/friends/wallet/prayer/notifications fail independently instead of blanking the whole screen.
- Added user-visible partial-data recovery and retry controls with live status semantics.
- Non-home routes are code-split with React.lazy/Suspense; HLS engine loads only when an HLS stream is opened.
- Live API resources retry automatically when connectivity returns.
- Added coarse-pointer touch targets, stronger keyboard focus visibility, compact-phone layout hardening and preserved reduced-motion behavior.
- Added `tests/group8-ux-performance.test.mjs`.

Closure:
- PR #28 merged to develop at `be74f33a3cfa13a97232e7a957b269eff971ca07`.
- Phase 1–11 applicable CI, Phase 9 QA, CodeQL Security and Android Release Candidate: PASS.

### GROUP 9 — SECURITY / DATA INTEGRITY / OPERATIONS
Status: **COMPLETE**

Changes:
- Hardened Production preflight so required security secrets must be non-placeholder, at least 32 characters, and distinct from each other.
- Added retention-safe PostgreSQL backup tooling that excludes temporary messages/reactions, notifications, Telemetry, precise Nearby locations, live sessions/recovery/MFA-pending state and Push subscriptions.
- Durable local backup contains Store assets and Android releases only; the `voice/` directory is explicitly excluded.
- Added SHA-256 + pg_restore-list backup verification and archive path validation.
- Added destructive restore guards, including a separate explicit Production confirmation, and defense-in-depth cleanup of ephemeral/session/location/push state after restore.
- Added retention audit for expired rows, the hard Telemetry 24h invariant and stale voice files.
- Added non-mutating operational release preflight.
- Added Backup/Restore, Rollback, Secret Rotation and Security Operations runbooks.
- Documented that application rate limits are not volumetric DDoS protection; edge/reverse-proxy/provider controls remain required.
- Added `tests/group9-security-operations.test.mjs`.

Closure:
- PR #29 merged to develop at `15aefbc8c99ddb6ffa884df01c8e58a9a6ef2972`.
- All applicable Phase CI, Phase 9 QA, CodeQL Security and Android Release Candidate: PASS.

### GROUP 10 — PRODUCTION DEPLOYMENT & OWNER BOOTSTRAP
Status: **BLOCKED_EXTERNAL** (source implementation complete; real Production execution requires server access)

Source-side changes:
- Production env generation provisions `OWNER_USERNAME=ahmed` and a one-time owner activation secret outside Git.
- Added verified owner-bootstrap shutdown that refuses to disable activation until active `ahmed` has all five staff roles.
- Deployment runs Production security preflight before migrations and shared public smoke verification after Nginx integration.
- Public verification covers health, readiness, Web/PWA shell, download route, Socket.IO handshake and security headers.
- Added production/owner bootstrap runbook and Group 10 regression tests.

External closure required:
- Execute deployment on the real Ubuntu host.
- Create `ahmed`, configure Admin MFA, then disable owner bootstrap.
- Record non-secret health/readiness/container/retention evidence.

### GROUP 11 — FINAL TWO-ACCOUNT + PHYSICAL DEVICE QA
Status: **BLOCKED_EXTERNAL**

### GROUP 12 — RELEASE CLOSURE & PUBLIC BETA
Status: **NOT STARTED**

## Rule
A group is never marked DONE from file existence alone. Launch-critical behavior requires automated proof and, where specified, production/physical-device evidence.
