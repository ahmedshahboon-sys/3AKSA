#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

backup_dir="${1:-}"
[[ -n "$backup_dir" && -d "$backup_dir" ]] || { echo "Usage: restore.sh <backup-dir>" >&2; exit 2; }
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${STORAGE_LOCAL_ROOT:?STORAGE_LOCAL_ROOT is required}"
[[ "${RESTORE_CONFIRM:-}" == "RESTORE_3AKSA" ]] || {
  echo "Set RESTORE_CONFIRM=RESTORE_3AKSA to confirm destructive restore." >&2
  exit 3
}
if [[ "${NODE_ENV:-}" == "production" && "${ALLOW_PRODUCTION_RESTORE:-}" != "I_UNDERSTAND_THIS_REPLACES_PRODUCTION" ]]; then
  echo "Production restore blocked. Set ALLOW_PRODUCTION_RESTORE=I_UNDERSTAND_THIS_REPLACES_PRODUCTION after maintenance mode + verified backup." >&2
  exit 4
fi
if [[ "$STORAGE_LOCAL_ROOT" != /* || "$STORAGE_LOCAL_ROOT" == "/" ]]; then
  echo "STORAGE_LOCAL_ROOT must be an absolute non-root path" >&2
  exit 5
fi

"$(dirname "$0")/verify-backup.sh" "$backup_dir"

pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname="$DATABASE_URL" "$backup_dir/database.dump"

mkdir -p "$STORAGE_LOCAL_ROOT"
rm -rf -- "$STORAGE_LOCAL_ROOT/store" "$STORAGE_LOCAL_ROOT/releases"
tar -C "$STORAGE_LOCAL_ROOT" -xf "$backup_dir/durable-storage.tar"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM message_reactions;
DELETE FROM room_messages;
DELETE FROM private_messages;
DELETE FROM notification_deliveries;
DELETE FROM notifications;
DELETE FROM telemetry_events;
DELETE FROM user_locations;
DELETE FROM auth_sessions;
DELETE FROM password_recovery_requests;
DELETE FROM admin_mfa_pending;
DELETE FROM push_subscriptions;
SQL

echo "Restore completed. Run migrations, production preflight, /ready, and two-account smoke tests before reopening traffic."
