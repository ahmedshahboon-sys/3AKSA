# Phase 11 — MARBO3A Server Integration

This phase packages 3AKSA for the approved temporary trial at `https://marbo3a.ly/3aksa/` while keeping its code, authentication, database, storage and lifecycle separate from MARBO3A.

## Observed host topology

The target host currently runs MARBO3A in Docker on the external Docker network `marbo3a_default`.

- MARBO3A web is published on host loopback port 3000.
- MARBO3A API is published on host loopback port 4000.
- PostgreSQL 16 is `marbo3a-db-1`.
- Redis 7 is `marbo3a-redis-1`.
- Host Nginx terminates TLS for `marbo3a.ly`.
- Host port 3101 is reserved for 3AKSA API.

3AKSA does not alter the MARBO3A Compose project. It joins the existing Docker network only to reach PostgreSQL and Redis.

## Isolation model

3AKSA gets:

- dedicated PostgreSQL database: `threeaksa`
- dedicated PostgreSQL login: `threeaksa_app`
- Redis namespace: `3aksa:`
- dedicated voice/storage directory: `/var/lib/3aksa`
- dedicated Web/PWA directory: `/var/www/3aksa/3aksa`
- dedicated secrets file: `/etc/3aksa/3aksa.env`
- API published only as `127.0.0.1:3101`

The API binds `0.0.0.0` only inside its container. Docker publishes the port exclusively to host loopback. Fastify trusts only loopback and the exact Docker gateway written into `TRUSTED_PROXY_CIDRS`.

## Deployment

From a checked-out copy of the repository at the desired tested commit:

```bash
sudo bash infra/server/deploy-trial.sh
```

The script:

1. validates Docker/Nginx prerequisites;
2. creates the separate PostgreSQL role/database without printing its password;
3. generates persistent random application secrets outside Git;
4. builds the server image using the frozen lockfile;
5. applies migrations;
6. builds Web/PWA specifically for `/3aksa/`;
7. starts API + cleanup worker;
8. requires the local readiness check to pass;
9. backs up the MARBO3A Nginx file;
10. installs only the 3AKSA subpath snippet and validates `nginx -t` before reload;
11. verifies public health/readiness.

## Rollback boundary

To remove the Nginx integration, run:

```bash
sudo bash infra/server/rollback-nginx.sh
```

To stop only 3AKSA containers:

```bash
docker compose -f infra/docker/compose.server.yml down
```

Neither command stops or recreates MARBO3A containers.

## Push notifications

The first trial can run without VAPID/FCM. Do not put blank optional push variables into the production env file. Add real VAPID/FCM values later only through `/etc/3aksa/3aksa.env`.

## Android

The Phase 10 test APK already points to:

- `https://marbo3a.ly/3aksa/api`
- `https://marbo3a.ly/3aksa/socket.io`

After the public readiness endpoint is green, the same APK can be used for registration/login and functional testing without rebuilding it.
