# 3AKSA Mobile

This directory owns the Android Capacitor wrapper for 3AKSA.

The Android app will reuse the React web UI from `apps/web` wherever practical and will connect only to the 3AKSA backend.

## Rules

- Independent application/package identity from MARBO3A.
- Production signing keystore and passwords must never enter Git.
- Android-only code is added only when native behavior is required (push, haptics, update integration, safe-area/platform hooks).
- The permanent package ID must be finalized before the first production-signed release.
- Native Android project generation is intentionally deferred until the web foundation and final package ID are ready.
