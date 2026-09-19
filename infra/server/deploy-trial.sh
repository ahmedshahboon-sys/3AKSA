#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="${ROOT}/infra/docker/compose.server.yml"

for command in docker openssl nginx curl; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Missing required command: ${command}" >&2
    exit 1
  }
done

docker compose version >/dev/null

docker network inspect marbo3a_default >/dev/null
for container in marbo3a-db-1 marbo3a-redis-1; do
  docker inspect "${container}" >/dev/null
done

install -d -m 700 /var/lib/3aksa
chown 1000:1000 /var/lib/3aksa
install -d -m 755 /var/www/3aksa/3aksa

"${ROOT}/infra/server/bootstrap-database.sh"
"${ROOT}/infra/server/create-production-env.sh"

CURRENT_VERSION="$(git rev-parse --short=12 HEAD)"
if grep -q '^APP_VERSION=' /etc/3aksa/3aksa.env; then
  sed -i "s/^APP_VERSION=.*/APP_VERSION=${CURRENT_VERSION}/" /etc/3aksa/3aksa.env
else
  printf '\nAPP_VERSION=%s\n' "${CURRENT_VERSION}" >> /etc/3aksa/3aksa.env
fi
chmod 600 /etc/3aksa/3aksa.env

cd "${ROOT}"

docker compose -f "${COMPOSE}" build api
docker compose -f "${COMPOSE}" --profile ops run --rm api sh -lc 'pnpm --filter @3aksa/api security:preflight'
docker compose -f "${COMPOSE}" --profile ops run --rm migrate
docker compose -f "${COMPOSE}" --profile build run --rm web-build
docker compose -f "${COMPOSE}" up -d api worker

ready=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3101/3aksa/api/ready >/tmp/3aksa-ready.json 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done

if [ "${ready}" -ne 1 ]; then
  echo "3AKSA API did not become ready." >&2
  docker compose -f "${COMPOSE}" ps
  docker compose -f "${COMPOSE}" logs --tail=120 api worker
  exit 1
fi

cat /tmp/3aksa-ready.json
rm -f /tmp/3aksa-ready.json

"${ROOT}/infra/server/install-nginx-subpath.sh"

bash "${ROOT}/infra/server/verify-production.sh"

echo
echo "3AKSA trial deployment is live at https://marbo3a.ly/3aksa/"
echo "Before public beta: create the owner account 'ahmed' using the secret in /etc/3aksa/owner-claim-secret, then run:"
echo "  sudo bash infra/server/disable-owner-bootstrap.sh"
