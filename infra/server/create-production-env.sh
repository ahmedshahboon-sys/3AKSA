#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

ENV_DIR=/etc/3aksa
ENV_FILE="${ENV_DIR}/3aksa.env"
DB_PASSWORD_FILE="${ENV_DIR}/db-password"
NETWORK="${THREEAKSA_DOCKER_NETWORK:-marbo3a_default}"

install -d -m 700 "${ENV_DIR}"
[ -s "${DB_PASSWORD_FILE}" ] || {
  echo "Missing ${DB_PASSWORD_FILE}. Run bootstrap-database.sh first." >&2
  exit 1
}

if [ -s "${ENV_FILE}" ]; then
  echo "${ENV_FILE} already exists; preserving existing production secrets."
  exit 0
fi

GATEWAY="$(docker network inspect "${NETWORK}" --format '{{(index .IPAM.Config 0).Gateway}}')"
[ -n "${GATEWAY}" ] || {
  echo "Could not resolve Docker gateway for ${NETWORK}" >&2
  exit 1
}

DB_PASSWORD="$(tr -d '\r\n' < "${DB_PASSWORD_FILE}")"
APP_VERSION="$(git rev-parse --short=12 HEAD 2>/dev/null || printf 'trial')"
SESSION_SECRET="$(openssl rand -hex 48)"
PASSWORD_PEPPER="$(openssl rand -hex 48)"
ADMIN_MFA_ENCRYPTION_KEY="$(openssl rand -hex 48)"
PUSH_ENCRYPTION_KEY="$(openssl rand -hex 48)"

umask 077
cat > "${ENV_FILE}.tmp" <<EOF
NODE_ENV=production
APP_VERSION=${APP_VERSION}

API_BIND_MODE=container
API_HOST=0.0.0.0
API_PORT=3101
API_BASE_PATH=/3aksa/api
SOCKET_PATH=/3aksa/socket.io
TRUSTED_PROXY_CIDRS=127.0.0.1,::1,${GATEWAY}

DATABASE_URL=postgresql://threeaksa_app:${DB_PASSWORD}@marbo3a-db-1:5432/threeaksa

REDIS_URL=redis://marbo3a-redis-1:6379/0
REDIS_KEY_PREFIX=3aksa:

STORAGE_DRIVER=local
STORAGE_LOCAL_ROOT=/var/lib/3aksa/storage

SESSION_SECRET=${SESSION_SECRET}
PASSWORD_PEPPER=${PASSWORD_PEPPER}
ADMIN_MFA_ENCRYPTION_KEY=${ADMIN_MFA_ENCRYPTION_KEY}
PUSH_ENCRYPTION_KEY=${PUSH_ENCRYPTION_KEY}
WEB_ALLOWED_ORIGINS=https://marbo3a.ly,https://www.marbo3a.ly
WEB_PUSH_SUBJECT=mailto:admin@marbo3a.ly
EOF

install -m 600 "${ENV_FILE}.tmp" "${ENV_FILE}"
rm -f "${ENV_FILE}.tmp"

echo "Created ${ENV_FILE} with fresh production secrets."
echo "Trusted Docker proxy gateway: ${GATEWAY}"
