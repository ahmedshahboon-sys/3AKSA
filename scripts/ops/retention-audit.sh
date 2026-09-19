#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${STORAGE_LOCAL_ROOT:?STORAGE_LOCAL_ROOT is required}"

sql_output="$(psql "$DATABASE_URL" -AtX -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'expired_room_messages='||count(*) FROM room_messages WHERE expires_at<=now();
SELECT 'expired_private_messages='||count(*) FROM private_messages WHERE expires_at<=now();
SELECT 'expired_notifications='||count(*) FROM notifications WHERE expires_at<=now();
SELECT 'expired_telemetry='||count(*) FROM telemetry_events WHERE expires_at<=now();
SELECT 'telemetry_over_24h='||count(*) FROM telemetry_events WHERE expires_at>created_at+interval '24 hours';
SQL
)"
printf '%s\n' "$sql_output"

failed=0
while IFS='=' read -r key value; do
  [[ "$value" =~ ^[0-9]+$ ]] || continue
  if [[ "$key" == telemetry_over_24h && "$value" -ne 0 ]]; then
    echo "Retention invariant violated: $key=$value" >&2
    failed=1
  fi
done <<< "$sql_output"

if [[ -d "$STORAGE_LOCAL_ROOT/voice" ]]; then
  stale_voice="$(find "$STORAGE_LOCAL_ROOT/voice" -type f -mmin +1500 -print -quit)"
  if [[ -n "$stale_voice" ]]; then
    echo "Voice file older than 25h found: $stale_voice" >&2
    failed=1
  fi
fi

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "Retention audit completed. Expired-row counts above should normally drain toward zero as the worker runs."
