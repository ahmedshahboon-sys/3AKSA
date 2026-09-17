# 3AKSA visual source package

The canonical binary visual package must live at:

`docs/design/source/3AKSA_VISUAL_SOURCE_OF_TRUTH.zip`

The package itself is the approved owner-supplied source of truth. Runtime PNG files under `apps/web/public/icons/` are materialized from this package by `scripts/import-visual-assets.sh` and verified byte-for-byte by SHA-256 before a Phase 1 build is accepted.

Do not redraw, recolor, crop, regenerate, or replace the official logos in code.
