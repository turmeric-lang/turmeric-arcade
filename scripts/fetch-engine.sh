#!/usr/bin/env bash
# fetch-engine.sh -- build the arcade's engine into web/public/engine/.
#
# The engine is turmeric's browser JIT module (turmeric-jit.{js,wasm}: the
# compiler's front half, c2mir and MIR's interpreter) in its JSPI build, plus
# stdlib.data, the stdlib package the module mounts.  It is built from a
# turmeric checkout, never downloaded: turmeric publishes no JSPI module yet.
#
#   bash scripts/fetch-engine.sh [TURMERIC_DIR]
#
# TURMERIC_DIR is a turmeric checkout at scripts/engine.lock's TURMERIC_REF
# (default ../turmeric; the script says so, and goes on, when the checkout is
# at another commit).  Needs the emsdk environment (emcc on PATH), cmake,
# python3 and make.  The first build compiles the whole module (a few minutes);
# a rerun relinks.
#
#   ARCADE_ENGINE_BUILD=<dir>   where the module is built (default
#                               TURMERIC_DIR/build-wasm/arcade-jspi)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
TUR=$(cd "${1:-$ROOT/../turmeric}" 2>/dev/null && pwd) || { echo "fetch-engine: no turmeric checkout at ${1:-$ROOT/../turmeric}" >&2; exit 2; }
# shellcheck disable=SC1091
. "$HERE/engine.lock"

command -v emcc >/dev/null || { echo "fetch-engine: emcc is not on PATH (source the emsdk environment)" >&2; exit 2; }
[ -f "$TUR/tools/wasm-jit-spike/jspi/build.sh" ] || { echo "fetch-engine: $TUR has no tools/wasm-jit-spike/jspi/build.sh (is it at $TURMERIC_REF?)" >&2; exit 2; }
HEAD=$(git -C "$TUR" rev-parse HEAD 2>/dev/null || echo unknown)
[ "$HEAD" = "$TURMERIC_REF" ] || echo "fetch-engine: note: $TUR is at $HEAD, engine.lock says $TURMERIC_REF" >&2

BUILD=$TUR/build-wasm
OUT=${ARCADE_ENGINE_BUILD:-$BUILD/arcade-jspi}
# Configure once: that writes wasm-jit/sources.txt, the module's source list;
# then the stdlib package, which the module's link embeds a loader for.
[ -f "$BUILD/wasm-jit/sources.txt" ] || cmake -S "$TUR" -B "$BUILD" -DTUR_WASM=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build "$BUILD" --target tur_stdlib_pkg
TUR_WASM_BUILD_DIR=$BUILD bash "$TUR/tools/wasm-jit-spike/jspi/build.sh" "$OUT"

DEST=$ROOT/web/public/engine
mkdir -p "$DEST"
for f in turmeric-jit.js turmeric-jit.wasm stdlib.data; do
  cp "$OUT/wasm-jit/$f" "$DEST/$f"
done
grep -q promising "$DEST/turmeric-jit.js" || { echo "fetch-engine: the module is not a JSPI build (no promising export)" >&2; exit 1; }
printf '{"turmeric":"%s","version":"%s","built":"%s"}\n' "$HEAD" "$(tr -d '\n' < "$TUR/VERSION")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DEST/engine.json"
echo "fetch-engine: $DEST ($(du -h "$DEST/turmeric-jit.wasm" | cut -f1) wasm, turmeric $(cut -c1-12 <<<"$HEAD"))"
