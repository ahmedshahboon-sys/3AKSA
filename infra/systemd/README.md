# systemd services

Planned production units:

- `3aksa-api.service`
- `3aksa-worker.service`

They must run as a dedicated unprivileged Linux user (for example `3aksa` or another Linux-safe equivalent), bind application services to loopback unless explicitly required otherwise, load secrets from server-side protected environment files, and use graceful restart/shutdown behavior.

No unit in this repository should contain production credentials.
