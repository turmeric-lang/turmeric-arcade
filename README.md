# Turmeric Arcade

The raylib playground for the [Turmeric](https://github.com/turmeric-lang/turmeric)
language, at **play.turmeric-lang.com**: write a program in the browser and run
it on the compiler's own engine, with a screen for it to draw on.

> Status: the P0 spike passes. With the arcade module (turmeric's
> `tools/wasm-jit-spike/arcade/build.sh`: the JSPI JIT module with raylib's
> web archive and the raylib and math spices embedded) the screen pane runs
> the raylib quick start, a `run-main-loop` program and a blocking frame
> loop under JSPI; `web/tests/raylib.spec.js` checks all three. CI still
> builds the plain engine (no raylib), on which that spec skips; making the
> arcade module the CI engine is P1.

The plan is
[docs/upcoming/raylib-web-playground-plan.md](https://github.com/turmeric-lang/turmeric/blob/main/docs/upcoming/raylib-web-playground-plan.md)
in the turmeric repo. In its terms this repo is architecture J (the JIT module
with raylib linked in, spices as source packages) and the screen pane is
section 5.2; the contract between the page and the pane is written at the top
of `web/screen.js`.

## How it works

- **The engine** is turmeric's `turmeric-jit.{js,wasm}` -- the compiler's
  front half, c2mir and MIR's interpreter -- in its **JSPI** build
  (`-sJSPI`, the JavaScript Promise Integration), so a program's blocking
  frame loop suspends the wasm stack instead of the page. It needs a browser
  with JSPI: Chrome 137 or later today. `stdlib.data` beside it is the stdlib
  package the module mounts.
- **Run** creates a fresh same-origin iframe (`web/screen.html`), whose shell
  (`web/screen.js`) boots the engine on the iframe's main thread, where a
  canvas is, compiles and runs the program it receives by `postMessage`, and
  streams stdout and stderr lines back to the page's console. Under JSPI
  `turi_wasm_jit_run` returns a Promise the shell awaits. **Stop** removes
  the iframe; a second Run replaces it. No module teardown is ever attempted:
  the iframe is the teardown.
- A program that leaves `main` by Emscripten's `unwind` (a `run-main-loop`
  program handing its frame loop to the browser) is reported as
  `compiled -- main loop running`, not as a trap. A wasm trap, or either
  stack running out, is reported as the error it is, and the next Run gets a
  fresh engine.
- The page is cross-origin isolated (COOP/COEP; the engine is a pthreads
  build) and carries one Content-Security-Policy (`web/csp.js`), sent by the
  dev server, stamped into the built `_headers`, and set by `web/worker.js`.

## Building

The engine is built from a turmeric checkout at the commit
`scripts/engine.lock` names (turmeric publishes no JSPI module yet). It needs
the [emsdk](https://emscripten.org/docs/getting_started/downloads.html)
environment, cmake, python3 and make:

```sh
git clone https://github.com/turmeric-lang/turmeric ../turmeric
git -C ../turmeric checkout "$(sed -n 's/^TURMERIC_REF=//p' scripts/engine.lock)"
bash scripts/fetch-engine.sh ../turmeric      # -> web/public/engine/
```

The first build compiles the whole module (a few minutes); a rerun relinks.
Then the site:

```sh
cd web
npm install
npm run dev          # http://localhost:3100 (never 3000: that is Try Turmeric's)
npm test             # Playwright, in a Chromium with JSPI
npm run build        # dist/client + the Worker
npm run deploy       # wrangler deploy to play.turmeric-lang.com
```

`ARCADE_CHROMIUM=/path/to/chromium npm test` runs the suite in another
Chromium than the one Playwright installed. Without `web/public/engine/` the
suite skips with a notice (in CI it fails: a missing engine is a broken
build).

## Layout

```
scripts/engine.lock        the turmeric commit and emsdk version the engine is built from
scripts/fetch-engine.sh    builds the engine into web/public/engine/
web/index.html, main.js    the page: editor, Run/Stop, Examples, console
web/screen.html, screen.js the screen pane's shell, one run per iframe
web/examples.js            the Examples menu (plain programs until raylib lands)
web/csp.js                 the one Content-Security-Policy
web/worker.js              the Cloudflare Worker in front of the static site
web/tests/                 Playwright: run, streaming, Stop, stack overflow
```

## License

MIT, see [LICENSE.md](LICENSE.md).
