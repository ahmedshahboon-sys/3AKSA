# ADR 0001 — Foundation boundaries

Status: Accepted

## Decision

3AKSA V1 uses a TypeScript/pnpm modular monolith with separate Web, API, Worker and Mobile wrapper workspaces. The application is independent from MARBO3A at source, identity, authentication, persistence, cache and storage levels.

The initial web entry path is configuration-driven and defaults to `/3aksa/`. Vite base, React Router basename, API base path, Socket.IO path and PWA scope must follow configuration so a later move to a standalone domain does not require architectural changes.

PostgreSQL uses a dedicated database/user. Redis uses an explicit `3aksa:` namespace at minimum. Storage is isolated behind an adapter boundary.

## Consequences

- No SSO/account sharing with MARBO3A in V1.
- No direct production deployment or MARBO3A modification from normal development work.
- Future media (calls, voice rooms, live) remains outside the V1 chat data plane and can later move to a dedicated WebRTC/SFU media plane.
