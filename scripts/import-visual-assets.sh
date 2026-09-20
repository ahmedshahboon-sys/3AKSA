#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-docs/design/source/3AKSA_VISUAL_SOURCE_OF_TRUTH.zip}"
OUT_DIR="apps/web/public/icons"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "Missing visual source package: $ZIP_PATH" >&2
  echo "Or pass an explicit path: bash scripts/import-visual-assets.sh /path/to/3AKSA_VISUAL_SOURCE_OF_TRUTH.zip" >&2
  exit 1
fi

command -v unzip >/dev/null 2>&1 || { echo "The 'unzip' command is required." >&2; exit 1; }
mkdir -p "$OUT_DIR"

extract() {
  local source="$1" target="$2"
  unzip -p "$ZIP_PATH" "$source" > "$OUT_DIR/$target"
  [[ -s "$OUT_DIR/$target" ]] || { echo "Failed to extract $source" >&2; exit 1; }
}

extract "logos/3AKSA-logo-main-192.png" "logo-main-192.png"
extract "logos/3AKSA-logo-main-512.png" "logo-main-512.png"
extract "logos/3AKSA-logo-pink-512.png" "logo-pink-512.png"

printf 'Imported official 3AKSA runtime assets into %s\n' "$OUT_DIR"
