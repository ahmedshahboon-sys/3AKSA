# Deployment

3AKSA production deployment is manual/trusted-release only. No server deployment is authorized by repository changes alone.

Before first production integration, inspect the real server state: Ubuntu, running services, ports, Nginx, PostgreSQL, Redis, RAM/CPU/disk, SSL, storage and backup setup. Apply minimum safe changes and do not restart or replace unrelated MARBO3A services/configuration.
