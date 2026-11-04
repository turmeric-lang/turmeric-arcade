#!/usr/bin/env bash
#
# Regenerate the subsetted Iosevka webfonts in web/fonts/: the arcade's
# display and editor face.  The same script as the C playground's
# (turmeric-lang/c2mp scripts/subset-iosevka.sh), with this repo's paths.
#
# The upstream @fontsource/iosevka "latin" woff2 is ~984 KB *per weight*: it
# carries ~30k glyphs, almost all of which are the stylistic-variant sets
# (cv01-cv98, ss01-ss20, the per-language VXL*/HSKL/RAKU features) that Iosevka
# ships so you can rebuild it to taste. We use none of them, so we keep only the
# codepoints the playground can actually display and drop every layout feature
# except the three that matter. That is 984 KB -> ~21 KB per weight.
#
# Features kept:
#   calt  contextual alternates -- this is what draws Iosevka's ligatures
#         (-> != == <= >= && || /* */), which is most of the point in a code editor
#   ccmp  glyph composition/decomposition, needed for correct mark rendering
#   locl  localized forms
#
# Codepoints kept:
#   U+0020-007E  printable ASCII -- the editor is a code editor, all of it is live
#   U+00A0-00FF  Latin-1 supplement, cheap insurance for pasted text
#   U+2014,2026  the em dash and ellipsis in the UI copy
#
# The UI's icons are SVG from the sprite in web/index.html, not font glyphs,
# so nothing outside the ranges above needs to be in here. Re-run this if
# that ever changes.
#
# Only weights 400 and 600 are generated because those are the only two
# styles.css asks for. Add to WEIGHTS if that changes.
#
# Run from anywhere:  ./scripts/subset-iosevka.sh
# Requires: python3, and `npm install` already run in web/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/web"
SRC_DIR="$WEB_DIR/node_modules/@fontsource/iosevka/files"
OUT_DIR="$WEB_DIR/fonts"
VENV="$WEB_DIR/node_modules/.cache/font-subset-venv"

WEIGHTS=(400 600)
UNICODES="U+0020-007E,U+00A0-00FF,U+2014,U+2026"
FEATURES="calt,ccmp,locl"

if [ ! -d "$SRC_DIR" ]; then
  echo "error: $SRC_DIR not found -- run 'npm install' in web/ first" >&2
  exit 1
fi

# fonttools needs brotli to so much as *read* a woff2, and Homebrew's pyftsubset
# ships without it. A throwaway venv under node_modules/.cache keeps this out of
# both the system python and the repo.
if [ ! -x "$VENV/bin/pyftsubset" ]; then
  echo "==> creating subsetting venv at $VENV"
  mkdir -p "$(dirname "$VENV")"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet fonttools brotli
fi

mkdir -p "$OUT_DIR"

for w in "${WEIGHTS[@]}"; do
  in="$SRC_DIR/iosevka-latin-$w-normal.woff2"
  out="$OUT_DIR/iosevka-$w.woff2"
  [ -f "$in" ] || { echo "error: missing $in" >&2; exit 1; }

  "$VENV/bin/pyftsubset" "$in" \
    --unicodes="$UNICODES" \
    --layout-features="$FEATURES" \
    --flavor=woff2 \
    --output-file="$out"

  printf '%-24s %7s -> %6s\n' "iosevka-$w.woff2" \
    "$(du -h "$in"  | cut -f1)" \
    "$(du -h "$out" | cut -f1)"
done

echo "==> wrote to $OUT_DIR (vite fingerprints these into dist/assets/ at build time)"
