#!/usr/bin/env bash
set -Eeuo pipefail

backup_dir="${1:-}"
[[ -n "$backup_dir" && -d "$backup_dir" ]] || { echo "Usage: verify-backup.sh <backup-dir>" >&2; exit 2; }

for file in database.dump durable-storage.tar metadata.txt SHA256SUMS; do
  [[ -f "$backup_dir/$file" ]] || { echo "Missing $file" >&2; exit 3; }
done

(
  cd "$backup_dir"
  sha256sum -c SHA256SUMS
)

pg_restore --list "$backup_dir/database.dump" >/dev/null

while IFS= read -r entry; do
  [[ -z "$entry" ]] && continue
  [[ "$entry" != /* && "$entry" != *".."* ]] || { echo "Unsafe storage archive path: $entry" >&2; exit 4; }
  [[ "$entry" == store || "$entry" == store/* || "$entry" == releases || "$entry" == releases/* ]] || {
    echo "Non-durable storage entry found: $entry" >&2
    exit 5
  }
done < <(tar -tf "$backup_dir/durable-storage.tar")

if tar -tf "$backup_dir/durable-storage.tar" | grep -Eq '(^|/)voice(/|$)'; then
  echo "Voice data must never be present in durable backups" >&2
  exit 6
fi

grep -q '^ephemeral_message_data=excluded$' "$backup_dir/metadata.txt"
grep -q '^voice_storage=excluded$' "$backup_dir/metadata.txt"
echo "3AKSA backup verification passed."
