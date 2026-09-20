# 3AKSA foundation architecture

## Independence

3AKSA is a standalone product. MARBO3A is only an initial web entry point through reverse-proxy path routing. V1 does not share users, authentication, sessions, PostgreSQL data, Redis keys, storage, admin access, or Android identity with MARBO3A.

## Initial routing

The default web deployment target is `/3aksa/`, but the base path is environment-driven. A later move to `/` on `3aksa.ly` or another independent domain must not require business-logic changes.

Default logical paths:

- Web: `/3aksa/`
- API: `/3aksa/api`
- Socket.IO: `/3aksa/socket.io`

## V1 shape

The backend is a modular monolith. API/realtime/database/storage boundaries are explicit so high-cost media workloads can be separated later without rewriting chat/social business logic.

Future voice rooms, calls, video calls and social live streaming are architecture-only concerns in V1; they are not implemented.

## Data isolation

- Dedicated PostgreSQL database and database role.
- Redis keys must use the `3aksa:` prefix at minimum; stronger ACL/instance isolation can be selected after server inspection.
- Dedicated storage root through a storage adapter.
- No production credentials are stored in Git.
