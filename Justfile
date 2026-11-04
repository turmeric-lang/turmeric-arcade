# Common tasks for Turmeric Arcade. `just` lists them.

turmeric := env_var_or_default("TURMERIC_DIR", "../turmeric")

default:
    @just --list

# Install the site's npm dependencies
install:
    cd web && npm install

# Install the Emscripten version engine.lock pins into .engine-deps/emsdk
emsdk:
    #!/usr/bin/env bash
    set -euo pipefail
    . scripts/engine.lock
    [ -d .engine-deps/emsdk ] || git clone --depth 1 https://github.com/emscripten-core/emsdk .engine-deps/emsdk
    cd .engine-deps/emsdk
    ./emsdk install "$EMSDK_VERSION"
    ./emsdk activate "$EMSDK_VERSION"

# Build the engine into web/public/engine/. Uses .engine-deps/emsdk if `just emsdk` ran (else emcc on PATH),
# and the turmeric checkout `dir`, else .engine-deps/turmeric if there is one, else TURMERIC_DIR
engine dir="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f .engine-deps/emsdk/emsdk_env.sh ]; then
        . .engine-deps/emsdk/emsdk_env.sh >/dev/null 2>&1
    fi
    dir={{quote(dir)}}
    if [ -z "$dir" ]; then
        if [ -d .engine-deps/turmeric ]; then dir=.engine-deps/turmeric; else dir={{turmeric}}; fi
    fi
    bash scripts/fetch-engine.sh "$dir"

# Check out the turmeric commit engine.lock pins (a detached worktree under
# .engine-deps/ when TURMERIC_DIR is a bare repo)
checkout-turmeric:
    #!/usr/bin/env bash
    set -euo pipefail
    ref=$(sed -n 's/^TURMERIC_REF=//p' scripts/engine.lock)
    git -C {{turmeric}} fetch origin
    if [ "$(git -C {{turmeric}} rev-parse --is-bare-repository)" = true ]; then
        dir=$PWD/.engine-deps/turmeric
        if [ -d "$dir" ]; then git -C "$dir" checkout --detach "$ref"
        else git -C {{turmeric}} worktree add --detach "$dir" "$ref"; fi
        echo "now: just engine $dir   (or TURMERIC_DIR=$dir)"
    else
        git -C {{turmeric}} checkout "$ref"
    fi

# Dev server at http://localhost:3100
dev:
    cd web && npm run dev

# Run the Playwright suite (extra args go to playwright)
test *args:
    cd web && npm test -- {{args}}

# Build dist/client and the Worker
build:
    cd web && npm run build

# Build and preview with wrangler
preview:
    cd web && npm run preview

# Deploy to play.turmeric-lang.com
deploy:
    cd web && npm run deploy

# Run an example natively, e.g. `just run 09-pong`
run name:
    tur --enable=script-deps run examples/{{name}}.tur

# Remove build output and test reports
clean:
    rm -rf web/dist web/.wrangler web/test-results web/playwright-report
