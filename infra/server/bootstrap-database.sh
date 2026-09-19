#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

DB_CONTAINER="${THREEAKSA_DB_CONTAINER:-marbo3a-db-1}"
PASSWORD_DIR=/etc/3aksa
PASSWORD_FILE="${PASSWORD_DIR}/db-password"

docker inspect "${DB_CONTAINER}" >/dev/null 2>&1 || {
  echo "Database container not found: ${DB_CONTAINER}" >&2
  exit 1
}

install -d -m 700 "${PASSWORD_DIR}"
if [ ! -s "${PASSWORD_FILE}" ]; then
  umask 077
  openssl rand -hex 32 > "${PASSWORD_FILE}"
fi
chmod 600 "${PASSWORD_FILE}"

DB_PASSWORD="$(tr -d '\r\n' < "${PASSWORD_FILE}")"
if ! [[ "${DB_PASSWORD}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Unexpected database password format in ${PASSWORD_FILE}" >&2
  exit 1
fi

docker exec -i "${DB_CONTAINER}" sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'threeaksa_app') THEN
    CREATE ROLE threeaksa_app LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE threeaksa_app PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE threeaksa OWNER threeaksa_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'threeaksa')\gexec

REVOKE ALL ON DATABASE threeaksa FROM PUBLIC;
GRANT CONNECT ON DATABASE threeaksa TO threeaksa_app;
SQL

docker exec -i "${DB_CONTAINER}" sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d threeaksa' <<'SQL'
ALTER SCHEMA public OWNER TO threeaksa_app;
GRANT ALL ON SCHEMA public TO threeaksa_app;
SQL

echo "3AKSA PostgreSQL database/user are ready. Password was not printed."
