# Group 11 — Final Two-Account + Physical Device QA

Group 11 is a real-environment release gate. Automated CI can prepare and regression-test the product, but it cannot prove physical Android stability, PWA installation on real devices, production permissions, or two-user behavior over the deployed network.

## Entry conditions

Do not begin this gate until:
- Group 10 source/CI is merged.
- Production deployment is green at `/3aksa/`.
- `/health` and `/ready` are green from outside the server.
- Owner `ahmed` exists, Admin MFA is enabled, and one-time owner bootstrap is disabled.
- A signed release APK is available with SHA-256 and signing-certificate proof.
- A retention-safe backup has been verified.

Use two ordinary non-owner test accounts, preferably one boy and one girl. Do not use self-delete during routine QA on the physical test phone because intentional account deletion blocks known installations from creating a replacement account.

## Android evidence harness

Connect exactly one authorized Android device with USB debugging enabled, install the release APK, then from the repository root run:

```bash
bash scripts/qa/android-device-evidence.sh start
```

After logging in and completing the critical journey, run:

```bash
bash scripts/qa/android-device-evidence.sh capture
```

The script verifies the package `ly.threeaksa.app` is installed and alive, records a SHA-256 hash of the device serial instead of the serial itself, records model/Android/package version metadata, captures app-PID-scoped logcat, and fails on known crash/ANR signatures. Evidence is stored under the gitignored `qa-evidence/` directory.

Review evidence locally before sharing excerpts because application logs can still contain diagnostics.

## Mandatory user journeys

Record PASS/FAIL and evidence reference for every item.

| Area | Required physical/two-account check |
|---|---|
| Cold start | Install APK, cold launch, remain alive without crash. |
| Post-login stability | Login, land on Home, background/foreground, force close/reopen, remain signed in as expected and no fatal logcat. |
| Shared account | Login to the same test account on Web/PWA and Android; confirm the same profile/user identity and simultaneous valid sessions. |
| Second account | Keep Account A and Account B active on separate clients for realtime tests. |
| Friends | Send, accept, cancel/remove request; state updates correctly on both clients. |
| Room text | A and B join one room and exchange text both directions in realtime. |
| Room voice | Record, send and play voice both directions; microphone permission is requested only when needed. |
| Presence | Join/leave/background/disconnect and confirm counts recover without a ghost member. |
| Gender policy | Boy account denied from girls-only room and girl account denied from boys-only room with correct user-facing message. |
| Private room | Invite/access/revoke behavior works and unauthorized account cannot enter. |
| Room moderation | Owner/moderator actions obey roles; ban/unban/timed ban behavior matches server rules. |
| Private chat | Text + voice both directions, request/accept flow, realtime delivery. |
| Block | Blocking prevents profile/private interaction and hides the blocked user where required in both directions. |
| Report | Report flow submits without exposing reporter-sensitive content in public UI. |
| Nearby | Explicit consent required; enable/disable works; gender filter and approximate distance work; exact coordinates are not exposed in ordinary UI. |
| Notifications | In-app notifications work. Push is required only when real VAPID/FCM credentials and the Push flag are enabled. |
| Store | If Store flag is enabled, browse/owned/equip flows work. Use test funds only for paid operations. |
| Rose | If paid features are enabled and test funds exist, one 1.000 LYD rose produces the documented 0.500 recipient / 0.500 platform split. |
| TV | If TV flag is enabled, open an authorized channel; room viewers cannot change channel unless allowed by room role. |
| Feature flags | Disabling optional TV/Store/Paid/Telemetry/Push does not break authentication or core text/voice chat. |
| Prayer | Schedule/settings render correctly and do not block core app startup. |
| PWA Android | Install PWA, launch standalone, authenticate, navigate core flows. |
| PWA iOS | Add to Home Screen, launch standalone, authenticate, navigate core flows. |
| Offline | Lose network while UI is open; app shows offline state and recovers without reload loop when network returns. |
| Weak network | Throttle/drop/reconnect during room/private navigation; no blank permanent state or duplicate send caused by retry. |
| Permissions | Deny and later grant microphone/location/notification permissions; core app must remain usable. |
| APK update | Install previous signed build then update to release candidate without losing the account/session unexpectedly. |
| Download | Public `/download` shows release proof and the downloaded APK matches published SHA-256. |
| Accessibility | Check focus/labels on Web and basic TalkBack navigation for auth, tabs, message composer and destructive confirmations. |

## P0/P1 blockers

Public Beta must not start with:
- post-login or startup crash;
- auth/session corruption;
- message delivery loss/duplication caused by normal retry;
- cross-user authorization leak;
- broken block/gender/private-room enforcement;
- wallet inconsistency;
- expired temporary messages/voice being retained or restored;
- owner/admin privilege failure;
- unsigned/wrongly signed APK or update incompatibility;
- Production readiness/storage/worker failure.

## Exit condition

Group 11 stays `BLOCKED_EXTERNAL` until the evidence template is completed from the actual Production environment and at least one physical Android device. Automated CI success alone is not sufficient.
