#!/usr/bin/env bash
set -Eeuo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE=/etc/3aksa/3aksa.env
OWNER_CLAIM_FILE=/etc/3aksa/owner-claim-secret
DB_CONTAINER="${THREEAKSA_DB_CONTAINER:-marbo3a-db-1}"
COMPOSE="${ROOT}/infra/docker/compose.server.yml"

[ -s "${ENV_FILE}" ] || { echo "Missing ${ENV_FILE}" >&2; exit 2; }
docker inspect "${DB_CONTAINER}" >/dev/null 2>&1 || { echo "Database container not found: ${DB_CONTAINER}" >&2; exit 2; }

read -r owner_id owner_status role_count < <(
docker exec -i "${DB_CONTAINER}" sh -lc 'psql -At -F " " -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d threeaksa' <<'SQL'
SELECT u.id,u.status,count(sr.role)
FROM users u
LEFT JOIN staff_roles sr ON sr.user_id=u.id
WHERE u.username_normalized='ahmed'
GROUP BY u.id,u.status;
SQL
)

[ -n "${owner_id:-}" ] || { echo "Owner account ahmed does not exist yet; refusing to disable bootstrap." >&2; exit 3; }
[ "${owner_status}" = "active" ] || { echo "Owner account is not active; refusing." >&2; exit 3; }
[ "${role_count}" -ge 5 ] || { echo "Owner does not have all required staff roles; refusing." >&2; exit 3; }

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
grep -v '^OWNER_CLAIM_SECRET=' "${ENV_FILE}" > "${tmp}"
install -m 600 "${tmp}" "${ENV_FILE}"
rm -f "${OWNER_CLAIM_FILE}"

cd "${ROOT}"
docker compose -f "${COMPOSE}" up -d --no-deps api
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3101/3aksa/api/ready >/dev/null 2>&1; then
    echo "Owner bootstrap disabled. Account ahmed remains active with ${role_count} staff roles."
    exit 0
  fi
  sleep 2
done

echo "API did not return ready after disabling owner bootstrap." >&2
exit 4
