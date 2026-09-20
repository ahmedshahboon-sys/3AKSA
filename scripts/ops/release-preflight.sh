#!/usr/bin/env bash
set -Eeuo pipefail

for command in node pnpm pg_dump pg_restore psql sha256sum tar; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 2; }
done

[[ "${NODE_ENV:-}" == "production" ]] || { echo "NODE_ENV must be production" >&2; exit 3; }
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${STORAGE_LOCAL_ROOT:?STORAGE_LOCAL_ROOT is required}"

pnpm --filter @3aksa/api security:preflight
pnpm --filter @3aksa/api typecheck
pnpm --filter @3aksa/worker typecheck

echo "3AKSA operational preflight passed. Runtime /ready, reverse-proxy headers, worker health and physical Android checks still require the deployment environment."
