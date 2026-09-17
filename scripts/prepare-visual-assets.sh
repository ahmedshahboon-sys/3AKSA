#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if node scripts/check-visual-assets.mjs >/dev/null 2>&1; then
  echo "Official 3AKSA runtime assets are already present and verified."
  exit 0
fi

bash scripts/import-visual-assets.sh "${1:-docs/design/source/3AKSA_VISUAL_SOURCE_OF_TRUTH.zip}"
node scripts/check-visual-assets.mjs
