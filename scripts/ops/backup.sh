#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${STORAGE_LOCAL_ROOT:?STORAGE_LOCAL_ROOT is required}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/3aksa}"

if [[ "$STORAGE_LOCAL_ROOT" != /* || "$STORAGE_LOCAL_ROOT" == "/" ]]; then
  echo "STORAGE_LOCAL_ROOT must be an absolute non-root path" >&2
  exit 2
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$BACKUP_ROOT/$stamp"
mkdir -p "$destination"

exclude_data=(
  room_messages
  private_messages
  message_reactions
  notifications
  notification_deliveries
  telemetry_events
  user_locations
  auth_sessions
  password_recovery_requests
  admin_mfa_pending
  push_subscriptions
)

dump_args=(--format=custom --no-owner --no-acl)
for table in "${exclude_data[@]}"; do
  dump_args+=("--exclude-table-data=public.$table")
done

pg_dump "${dump_args[@]}" --file="$destination/database.dump" "$DATABASE_URL"

entries=()
[[ -d "$STORAGE_LOCAL_ROOT/store" ]] && entries+=(store)
[[ -d "$STORAGE_LOCAL_ROOT/releases" ]] && entries+=(releases)
if (("${#entries[@]}" > 0)); then
  tar -C "$STORAGE_LOCAL_ROOT" -cf "$destination/durable-storage.tar" "${entries[@]}"
else
  tar -cf "$destination/durable-storage.tar" --files-from /dev/null
fi

cat > "$destination/metadata.txt" <<META
format=3aksa-backup-v1
created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ephemeral_message_data=excluded
voice_storage=excluded
redis=not_authoritative_not_backed_up
META

(
  cd "$destination"
  sha256sum database.dump durable-storage.tar metadata.txt > SHA256SUMS
)

echo "3AKSA backup created: $destination"
echo "Ephemeral messages, voice files, telemetry, notifications, exact Nearby locations and live sessions were intentionally excluded."
