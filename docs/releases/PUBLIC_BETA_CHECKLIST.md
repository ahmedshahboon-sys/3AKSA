# 3AKSA Public Beta Gate

This is a **go/no-go evidence checklist**, not permission to bypass missing evidence. A green GitHub build alone cannot satisfy Production or physical-device gates.

## A — Source integrity

- [ ] Release candidate SHA is the reviewed `develop` SHA.
- [ ] All required Phase CI workflows are green for the release-prep PR.
- [ ] Phase 9 QA is green.
- [ ] CodeQL Security is green.
- [ ] Android Release Candidate is green.
- [ ] No unresolved review thread.
- [ ] `node scripts/release/source-beta-gate.mjs` passes.

## B — Production deployment

- [ ] Retention-safe pre-deployment backup created and SHA verification passes.
- [ ] Reviewed SHA deployed at `https://marbo3a.ly/3aksa/`.
- [ ] Public `/health` PASS.
- [ ] Public `/ready` PASS.
- [ ] Web/PWA shell PASS.
- [ ] Public `/download` PASS.
- [ ] Socket.IO production handshake PASS.
- [ ] API + worker runtime state healthy.
- [ ] Retention audit PASS.
- [ ] Security headers PASS.
- [ ] Rollback path and Nginx backup identified before opening Beta.

## C — Owner / administration

- [ ] Account username exactly `ahmed` exists and is active.
- [ ] Owner has `super_admin`, `tv_admin`, `moderation_admin`, `finance_admin`, `release_admin`.
- [ ] Admin MFA enabled and verified.
- [ ] One-time `OWNER_CLAIM_SECRET` removed from Production env.
- [ ] `/etc/3aksa/owner-claim-secret` removed.
- [ ] Admin audit and Feature Flag controls verified.

## D — Signed Android build

- [ ] Trusted Release Build executed with versionName `1.0.1` and versionCode `2`.
- [ ] Official keystore secrets existed in GitHub Actions and were never exposed in logs/source.
- [ ] `apksigner verify` PASS.
- [ ] APK SHA-256 recorded.
- [ ] Signing certificate SHA-256 recorded.
- [ ] APK uploaded through Release Admin and publication metadata matches the signed artifact.
- [ ] Public download hash matches the trusted artifact.
- [ ] Fresh install PASS.
- [ ] Upgrade from previous signed build PASS.

## E — Group 11 real-device/two-account evidence

- [ ] Physical Android cold start PASS.
- [ ] Post-login/background/foreground/relaunch stability PASS.
- [ ] App-scoped logcat has no fatal/ANR blocker.
- [ ] Same identity on Web/PWA + Android PASS.
- [ ] Two-account room text + voice PASS.
- [ ] Two-account private text + voice PASS.
- [ ] Presence recovery PASS.
- [ ] Gender/private-room enforcement PASS.
- [ ] Friends/block/report PASS.
- [ ] Nearby consent/filter/distance PASS.
- [ ] Store/wallet/rose checks PASS when feature-enabled.
- [ ] TV PASS when feature-enabled.
- [ ] Android PWA PASS.
- [ ] iOS PWA PASS.
- [ ] Offline/weak-network recovery PASS.
- [ ] Permission deny/re-grant PASS.
- [ ] Basic accessibility smoke PASS.
- [ ] No open P0.
- [ ] No open P1.

## F — Optional integrations

For each optional feature, either provide Production evidence or keep its server flag OFF:
- [ ] TV verified or OFF.
- [ ] Store verified or OFF.
- [ ] Paid features verified or OFF.
- [ ] Telemetry verified or OFF.
- [ ] Push with real provider credentials verified or OFF.

Core authentication and text/voice chat must remain available when optional features are OFF.

## G — Public Beta opening

Only after A–F are complete:
- [ ] Record release SHA/version/date.
- [ ] Publish the signed Stable/Beta Android release as intended.
- [ ] Confirm download page presents the correct artifact proof.
- [ ] Open access to the intended tester cohort.
- [ ] Watch Production readiness, worker retention, error telemetry (if enabled), abuse reports and wallet anomalies.

## Immediate rollback / close-Beta conditions

Close or contain the Beta and follow `docs/operations/rollback.md` if there is:
- startup/post-login crash affecting normal use;
- authentication/authorization or private-data isolation failure;
- lost/duplicated financial transaction;
- message privacy/expiry failure;
- owner/admin access failure;
- broken Production readiness/storage/worker;
- wrong or unverifiable APK signature/update identity;
- any unresolved P0/P1 that makes continued testing unsafe.

## Current state

Until the Production, signing and physical-device evidence above is actually supplied, Group 12 remains `BLOCKED_EXTERNAL` and the release PR to `main` must stay Draft/unmerged.
