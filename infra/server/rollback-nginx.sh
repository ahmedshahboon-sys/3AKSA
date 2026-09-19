#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

SITE=/etc/nginx/sites-available/marbo3a
POINTER=/etc/3aksa/last-nginx-backup

[ -s "${POINTER}" ] || { echo "No recorded Nginx backup." >&2; exit 1; }
BACKUP="$(cat "${POINTER}")"
[ -f "${BACKUP}" ] || { echo "Backup not found: ${BACKUP}" >&2; exit 1; }

FAILED_COPY="${SITE}.before-rollback-$(date +%Y%m%d-%H%M%S)"
cp -a "${SITE}" "${FAILED_COPY}"
cp -a "${BACKUP}" "${SITE}"

if ! nginx -t; then
  cp -a "${FAILED_COPY}" "${SITE}"
  nginx -t || true
  echo "Rollback candidate failed validation; previous config restored." >&2
  exit 1
fi

systemctl reload nginx
echo "Nginx rolled back to ${BACKUP}"
