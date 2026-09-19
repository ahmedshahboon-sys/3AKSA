#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

ENV_DIR=/etc/3aksa
ENV_FILE="${ENV_DIR}/3aksa.env"
DB_PASSWORD_FILE="${ENV_DIR}/db-password"
OWNER_CLAIM_FILE="${ENV_DIR}/owner-claim-secret"
DB_CONTAINER="${THREEAKSA_DB_CONTAINER:-marbo3a-db-1}"
NETWORK="${THREEAKSA_DOCKER_NETWORK:-marbo3a_default}"

install -d -m 700 "${ENV_DIR}"
[ -s "${DB_PASSWORD_FILE}" ] || {
  echo "Missing ${DB_PASSWORD_FILE}. Run bootstrap-database.sh first." >&2
  exit 1
}

provision_owner_claim(){
  if [ ! -s "${OWNER_CLAIM_FILE}" ]; then
    umask 077
    openssl rand -hex 32 > "${OWNER_CLAIM_FILE}"
  fi
  chmod 600 "${OWNER_CLAIM_FILE}"
  local value
  value="$(tr -d '\r\n' < "${OWNER_CLAIM_FILE}")"
  if ! [[ "${value}" =~ ^[0-9a-f]{64}$ ]]; then
    echo "Unexpected owner claim secret format in ${OWNER_CLAIM_FILE}" >&2
    exit 1
  fi
  printf '%s' "${value}"
}

owner_account_exists(){
  docker inspect "${DB_CONTAINER}" >/dev/null 2>&1 || return 1
  docker exec -i "${DB_CONTAINER}" sh -lc 'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d threeaksa' 2>/dev/null <<'SQL' | grep -qx '1'
SELECT 1
FROM users
WHERE username_normalized='ahmed' AND status='active'
LIMIT 1;
SQL
}

if [ -s "${ENV_FILE}" ]; then
  echo "${ENV_FILE} already exists; preserving existing production secrets."
  if owner_account_exists; then
    echo "Owner account ahmed already exists; owner bootstrap remains disabled/preserved."
    exit 0
  fi
  if grep -q '^OWNER_CLAIM_SECRET=' "${ENV_FILE}"; then
    echo "Owner bootstrap is already configured."
    exit 0
  fi
  if grep -q '^OWNER_USERNAME=' "${ENV_FILE}"; then
    CURRENT_OWNER="$(grep '^OWNER_USERNAME=' "${ENV_FILE}" | tail -n1 | cut -d= -f2-)"
    [ "${CURRENT_OWNER}" = "ahmed" ] || {
      echo "Existing OWNER_USERNAME is not ahmed; refusing automatic owner-bootstrap change." >&2
      exit 1
    }
  else
    printf '\nOWNER_USERNAME=ahmed\n' >> "${ENV_FILE}"
  fi
  OWNER_CLAIM_SECRET="$(provision_owner_claim)"
  printf 'OWNER_CLAIM_SECRET=%s\n' "${OWNER_CLAIM_SECRET}" >> "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  echo "Enabled one-time owner bootstrap for username ahmed without rotating existing secrets."
  echo "Owner claim secret is stored at ${OWNER_CLAIM_FILE}; it was not printed."
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
OWNER_CLAIM_SECRET="$(provision_owner_claim)"

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
OWNER_USERNAME=ahmed
OWNER_CLAIM_SECRET=${OWNER_CLAIM_SECRET}
ADMIN_MFA_ENCRYPTION_KEY=${ADMIN_MFA_ENCRYPTION_KEY}
PUSH_ENCRYPTION_KEY=${PUSH_ENCRYPTION_KEY}
WEB_ALLOWED_ORIGINS=https://marbo3a.ly,https://www.marbo3a.ly
WEB_PUSH_SUBJECT=mailto:admin@marbo3a.ly
EOF

install -m 600 "${ENV_FILE}.tmp" "${ENV_FILE}"
rm -f "${ENV_FILE}.tmp"

echo "Created ${ENV_FILE} with fresh production secrets."
echo "Owner bootstrap is enabled for username: ahmed"
echo "Owner claim secret is stored at ${OWNER_CLAIM_FILE}; it was not printed."
echo "Trusted Docker proxy gateway: ${GATEWAY}"
