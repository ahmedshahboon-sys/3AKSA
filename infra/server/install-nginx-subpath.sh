#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE="${ROOT}/infra/nginx/3aksa-subpath.conf.example"
SITE=/etc/nginx/sites-available/marbo3a
SNIPPET_DIR=/etc/nginx/snippets
SNIPPET="${SNIPPET_DIR}/3aksa.conf"
STATE_DIR=/etc/3aksa
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${SITE}.3aksa-backup-${STAMP}"

[ -f "${SOURCE}" ] || { echo "Missing ${SOURCE}" >&2; exit 1; }
[ -f "${SITE}" ] || { echo "Missing ${SITE}" >&2; exit 1; }

install -d -m 755 "${SNIPPET_DIR}"
install -d -m 700 "${STATE_DIR}"
cp -a "${SITE}" "${BACKUP}"
printf '%s\n' "${BACKUP}" > "${STATE_DIR}/last-nginx-backup"
chmod 600 "${STATE_DIR}/last-nginx-backup"

install -m 644 "${SOURCE}" "${SNIPPET}"

if ! grep -Fq 'include /etc/nginx/snippets/3aksa.conf;' "${SITE}"; then
  if ! grep -Eq '^[[:space:]]*location / \{' "${SITE}"; then
    echo "Could not locate MARBO3A root location; restoring backup." >&2
    cp -a "${BACKUP}" "${SITE}"
    exit 1
  fi
  sed -i '0,/^[[:space:]]*location \/ {/s||    include /etc/nginx/snippets/3aksa.conf;\n\n&|' "${SITE}"
fi

if ! nginx -t; then
  echo "Nginx validation failed; restoring ${BACKUP}" >&2
  cp -a "${BACKUP}" "${SITE}"
  nginx -t || true
  exit 1
fi

systemctl reload nginx
echo "3AKSA Nginx subpath installed. Backup: ${BACKUP}"
