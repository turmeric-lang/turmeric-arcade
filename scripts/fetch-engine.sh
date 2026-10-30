#!/usr/bin/env bash
# fetch-engine.sh -- build the arcade's engine into web/public/engine/.
#
# The engine is turmeric's arcade module (turmeric-jit.{js,wasm}: the
# compiler's front half, c2mir and MIR's interpreter in their JSPI build, with
# raylib's web archive linked in), plus stdlib.data, the stdlib package the
# module mounts, the spice packages (spices/) with their loader (spices.js),
# which the screen mounts after start-up, and the editor's language server
# (lsp-worker.js, running the stock turmeric.{js,wasm}).  It is built by
# turmeric's tur_wasm_arcade target from a turmeric checkout, never
# downloaded: turmeric publishes no arcade module.
#
#   bash scripts/fetch-engine.sh [TURMERIC_DIR]
#
# TURMERIC_DIR is a turmeric checkout at scripts/engine.lock's TURMERIC_REF
# (default ../turmeric; the script says so, and goes on, when the checkout is
# at another commit).  turmeric-spices and raylib are checked out at the
# lock's SPICES_REF and RAYLIB_REF under .engine-deps/ (gitignored) unless
# these name checkouts to use instead:
#
#   ARCADE_SPICES=<turmeric-spices checkout>
#   ARCADE_RAYLIB=<raylib checkout>
#
# Needs the emsdk environment (emcc on PATH), cmake, python3, make and git.
# The first build compiles the whole module (about a minute); a rerun relinks.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
TUR=$(cd "${1:-$ROOT/../turmeric}" 2>/dev/null && pwd) || { echo "fetch-engine: no turmeric checkout at ${1:-$ROOT/../turmeric}" >&2; exit 2; }
# shellcheck disable=SC1091
. "$HERE/engine.lock"

command -v emcc >/dev/null || { echo "fetch-engine: emcc is not on PATH (source the emsdk environment)" >&2; exit 2; }
[ -f "$TUR/tools/wasm-jit/arcade/build.sh" ] || { echo "fetch-engine: $TUR has no tools/wasm-jit/arcade/build.sh (is it at $TURMERIC_REF?)" >&2; exit 2; }
HEAD=$(git -C "$TUR" rev-parse HEAD 2>/dev/null || echo unknown)
[ "$HEAD" = "$TURMERIC_REF" ] || echo "fetch-engine: note: $TUR is at $HEAD, engine.lock says $TURMERIC_REF" >&2

# checkout DIR URL REF: DIR at REF, fetched by ref (a sha or a tag), shallow.
checkout() {
  local dir=$1 url=$2 ref=$3
  if [ "$(git -C "$dir" rev-parse -q --verify HEAD 2>/dev/null)" != "$(git -C "$dir" rev-parse -q --verify "$ref^{commit}" 2>/dev/null || echo none)" ]; then
    [ -d "$dir/.git" ] || { mkdir -p "$dir"; git -C "$dir" init -q; git -C "$dir" remote add origin "$url"; }
    git -C "$dir" fetch -q --depth 1 origin "$ref"
    git -C "$dir" checkout -q FETCH_HEAD
  fi
}
DEPS=$ROOT/.engine-deps
SPICES=${ARCADE_SPICES:-}
if [ -z "$SPICES" ]; then
  SPICES=$DEPS/turmeric-spices
  checkout "$SPICES" https://github.com/turmeric-lang/turmeric-spices "$SPICES_REF"
fi
RAYLIB=${ARCADE_RAYLIB:-}
if [ -z "$RAYLIB" ]; then
  RAYLIB=$DEPS/raylib
  checkout "$RAYLIB" https://github.com/raysan5/raylib "$RAYLIB_REF"
fi
SPICES=$(cd "$SPICES" && pwd)
RAYLIB=$(cd "$RAYLIB" && pwd)

BUILD=$TUR/build-wasm
# TUR_ARCADE_RAYLIB_LIB is cleared: a prebuilt archive left in the build's
# cache would otherwise be linked instead of the RAYLIB_REF checkout's.
cmake -S "$TUR" -B "$BUILD" -DTUR_WASM=ON -DTUR_WASM_ARCADE=ON \
      -DTUR_ARCADE_RAYLIB_SRC="$RAYLIB" -DTUR_ARCADE_SPICES="$SPICES" \
      -DTUR_ARCADE_RAYLIB_LIB= \
      -DCMAKE_POLICY_VERSION_MINIMUM=3.5 > /dev/null
cmake --build "$BUILD" --target tur_wasm_arcade
OUT=$BUILD/wasm-arcade/wasm-jit

DEST=$ROOT/web/public/engine
mkdir -p "$DEST"
# turmeric.{js,wasm} and lsp-worker.js: the editor's language server.
for f in turmeric-jit.js turmeric-jit.wasm stdlib.data spices.js turmeric.js turmeric.wasm lsp-worker.js; do
  cp "$OUT/$f" "$DEST/$f"
done
# The spice packages (spices/index.json, one <name>.json each), which the
# screen mounts after the engine has started.
rm -rf "$DEST/spices"
cp -R "$OUT/spices" "$DEST/spices"
grep -q _turi_wasm_lsp_request "$DEST/turmeric.js" || { echo "fetch-engine: turmeric.js carries no language server" >&2; exit 1; }
grep -q promising "$DEST/turmeric-jit.js" || { echo "fetch-engine: the module is not a JSPI build (no promising export)" >&2; exit 1; }
printf '{"turmeric":"%s","spices":"%s","raylib":"%s","version":"%s","built":"%s"}\n' \
  "$HEAD" "$(git -C "$SPICES" rev-parse HEAD 2>/dev/null || echo unknown)" "$RAYLIB_REF" \
  "$(tr -d '\n' < "$TUR/VERSION")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DEST/engine.json"
echo "fetch-engine: $DEST ($(du -h "$DEST/turmeric-jit.wasm" | cut -f1) wasm, turmeric $(cut -c1-12 <<<"$HEAD"), raylib $RAYLIB_REF)"
