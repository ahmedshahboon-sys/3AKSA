# Deployment

3AKSA production deployment is manual/trusted-release only. Repository changes never deploy to a server automatically.

## Temporary trial target

The current approved trial target is `https://marbo3a.ly/3aksa/`. 3AKSA remains a separate service and codebase even while exposed below the MARBO3A hostname.

Use:

- `infra/nginx/3aksa-subpath.conf.example` as a reviewed Nginx fragment, never as a replacement for the existing MARBO3A server block.
- `infra/systemd/3aksa-api.service.example` and `infra/systemd/3aksa-worker.service.example` as hardening templates.
- `.github/workflows/trusted-release.yml` to build Web/PWA and a signed APK manually after release secrets exist.

Before first server integration inspect the real Ubuntu state: running services, ports, Nginx, PostgreSQL, Redis, RAM/CPU/disk, SSL, storage and backups. Back up affected config files before edits and validate Nginx/systemd health before reloading anything.

The API should bind only to loopback. Nginx is the public boundary. Store runtime data under a dedicated writable path such as `/var/lib/3aksa` and secrets in a root-owned environment file outside the repository.
