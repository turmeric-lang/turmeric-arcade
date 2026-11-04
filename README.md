# Turmeric Arcade

The raylib playground for the [Turmeric](https://github.com/turmeric-lang/turmeric)
language, at **play.turmeric-lang.com**: write a program in the browser and run
it on the compiler's own engine, with a screen for it to draw on.

> Status: P3. The engine is turmeric's arcade module (its `tur_wasm_arcade`
> target: the JSPI JIT module with raylib's web archive linked in), built in
> CI from the commit `scripts/engine.lock` pins. The page has Monaco with the
> language server, a Spices menu, share links, light and dark themes, and the
> screen pane; the Examples menu is the `examples/` tree, including the
> plan's section 8 set -- a bouncing ball, its frame-callback twin, pong and
> Life -- each verified natively and in the page (`web/tests/`).

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

## Writing a program

A program is an ordinary Turmeric module with a `main`. Its first form may be
a `defscript` header naming the spices it uses -- the Spices menu writes one,
pinned to the turmeric-spices commit the engine's packages were built from:

```turmeric
(defscript :spices #map{"raylib" #map{:url "https://github.com/turmeric-lang/turmeric-spices"
                                      :ref "<commit>" :subdir "spices/raylib"}})
(defmodule ball
  (export)
  (import raylib/core  :refer [init-window window-should-close begin-drawing
                               end-drawing clear-background])
  (import raylib/color :refer [raywhite])
  (defn main [] : int
    (init-window 480 270 "ball")
    (let [bg (raywhite)]
      (while (not (window-should-close))
        (begin-drawing)
        (clear-background bg)
        (end-drawing)))
    0))
```

- **The same file runs natively.** Copy it out and run
  `tur --enable=script-deps run ball.tur`: the header fetches the spices it
  names (raylib's C library is built once, into the script cache). On the
  page the header is satisfied from the engine's packages, and a spice the
  engine does not carry is refused by name rather than fetched. Without a
  header, the spices a program imports are mounted all the same.
- **Both loop styles run.** The blocking `while (not (window-should-close))`
  loop of raylib's own examples works as written: raylib's sleep at the end
  of each frame suspends the program (JSPI) and lets the page breathe. The
  callback style -- `run-main-loop`, or `with-web-game-loop` from
  `raylib/web` -- hands the browser a closure to call every frame; `main`
  returns at once, so keep the frame's state in globals or the closure.
- **The pane is 480x270.** Keys and the mouse reach the program once the
  canvas has focus (a click on it).
- **Make raylib's colours once.** `(raywhite)`, `(color r g b a)` and the
  like each allocate a handle; call them before the loop, not in it.
- **Two engine limits to steer around in a blocking loop** (both are open
  in turmeric's tracker): a `println` written directly in `main`'s loop body
  keeps 16 bytes per call until `main` returns -- put it in a helper `defn`,
  which returns every frame; and a frame loop written as mutual tail calls
  (`tick` calling `render` calling `tick`) grows the stack -- use `while`.
- **The engine compiles, it does not interpret.** A program's inline C is
  compiled in the page with the rest of it (Life reads the mouse that way).
  The interpreter fallback is off: a program the engine cannot compile (one
  that starts threads, say) is reported as refused.
- **Speed.** The engine is MIR's interpreter on wasm, several times slower
  than native code: Life's 64x36 step is about 20 ms, which is why it is
  64x36 and not 96x54.

The examples, in the order the menu lists them after the first six:

| File | Shows |
|---|---|
| `07-bouncing-ball.tur` | motion, `dt`, held keys, text; state in `^mut` bindings |
| `08-bouncing-ball-callback.tur` | the same as a frame callback (`with-web-game-loop`); web only |
| `09-pong.tur` | two paddles, collision, a score centred with `measure-text`, Space to serve |
| `10-life.tur` | a `vec` double-buffered at frame rate, the mouse through inline C, counts a native run prints too |

## Building

The engine is built from a turmeric checkout at the commit
`scripts/engine.lock` names (turmeric publishes no JSPI module yet). It needs
the [emsdk](https://emscripten.org/docs/getting_started/downloads.html)
environment, cmake, python3, make and git. turmeric-spices and raylib are
checked out at the lock's `SPICES_REF` and `RAYLIB_REF` under `.engine-deps/`
(or name your own with `ARCADE_SPICES=` / `ARCADE_RAYLIB=`):

```sh
git clone https://github.com/turmeric-lang/turmeric ../turmeric
git -C ../turmeric checkout "$(sed -n 's/^TURMERIC_REF=//p' scripts/engine.lock)"
bash scripts/fetch-engine.sh ../turmeric      # -> web/public/engine/
```

The first build compiles the whole module (about a minute); a rerun relinks.
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
scripts/engine.lock        the turmeric, turmeric-spices and raylib refs and emsdk version the engine is built from
scripts/fetch-engine.sh    builds the engine into web/public/engine/ (with spices/ and spices.js)
examples/                  the Examples menu: one program per file, titled by its ;;; header
web/index.html, main.js    the page: editor, Run/Stop, Examples, console
web/editor.js              Monaco (the textarea stays the editor if it fails to load)
web/editor-language.js     the Turmeric tokenizer, from Try Turmeric's web/editor-language.js
web/share.js, share-codec.js  share links: #code= (Try Turmeric's format), kept current, Share copies it
web/spices-menu.js         the Spices menu: ticks declare a spice in the program's defscript header
web/defscript.js           reads and rewrites that header (pinned to the engine's turmeric-spices commit)
web/lsp-client.js          the Monaco adapter for `tur lsp`, from Try's (its worker URL an option);
                           the server is engine/lsp-worker.js, started on the editor's first focus
web/screen.html, screen.js the screen pane's shell, one run per iframe
web/examples.js            reads examples/ into the menu at build time
web/public/theme.js        light/dark before first paint (Try Turmeric's switch); the OS's until picked
web/csp.js                 the one Content-Security-Policy
web/worker.js              the Cloudflare Worker in front of the static site
web/tests/                 Playwright: run, streaming, Stop, stack overflow, refusals,
                           and the raylib examples themselves
```

## License

MIT, see [LICENSE.md](LICENSE.md).
