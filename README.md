# Turmeric Arcade

The raylib playground for the [Turmeric](https://github.com/turmeric-lang/turmeric)
language, at **play.turmeric-lang.com**: write a program in the browser and run
it on the compiler's own engine, with a screen for it to draw on.

> Status: P4. The engine is turmeric's arcade module (its `tur_wasm_arcade`
> target: the JSPI JIT module with raylib's web archive and raygui linked in,
> and the raylib, math, raygui, ecs and ecs-raylib spices as packages), built in
> CI from the commit `scripts/engine.lock` pins. The page has Monaco with the
> language server, a Spices menu, share links, light and dark themes, and the
> screen pane; the Examples menu is the `examples/` tree, including the
> plan's section 8 set -- a bouncing ball, its frame-callback twin, pong,
> Life, a raygui panel and an ECS world -- each verified natively and in the
> page (`web/tests/`). P4 adds an FPS counter, `?example=` links and a
> layout for phones.

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
  canvas has focus (a click on it). On a phone a tap is a click; there is no
  keyboard, so the examples that need keys need one.
- **The FPS counter** in the status bar is the frames the program drew: one
  per `end-drawing`, counted where raylib swaps the buffer, twice a second.
  It shows only while something is being drawn.
- **Your program is kept** in this browser as you type, and comes back after
  a reload (a `#code=` or `?example=` link wins over it); Ctrl/Cmd+S keeps it
  at once. Blocked or full storage only means nothing is kept.
- **The dividers** between the editor and the screen, and the screen and the
  console, drag (or take the arrow keys when focused; double-click resets),
  and are remembered. F12 goes to a definition, as Cmd/Ctrl+click does.
- **Install it.** The site is a web app (Install in Chrome's address bar, Add
  to Home Screen on a phone). Once a game has run, the page works offline:
  the shell is cached when the site is installed, the engine when it is first
  used. A new version is offered in the status bar, never forced.
- **Links.** `?example=pong` opens on an example, `?example=pong&run` runs
  it too; Share gives that short link while the example is unedited and a
  `#code=` link once it is changed (which then wins over `?example=`).
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
| `11-raygui-tuner.tur` | a second spice: raygui's slider, checkbox and colour picker driving the ball; raygui's C is in the engine |
| `12-ecs-circles.tur` | a third: 200 entities, systems written by ecs-raylib's macros and one by hand, Space for 50 more |

A spice the engine carries is either all Turmeric (math, ecs, ecs-raylib),
mounted from its package when a program names it, or has C of its own
(raylib, raygui), which is linked into the engine; adding one of the latter
is a turmeric change (`TUR_ARCADE_SPICE_LIST` in its
`tools/wasm-jit/arcade/build.sh`), not a page change.

## Building

The engine is built from a turmeric checkout at the commit
`scripts/engine.lock` names (turmeric publishes no JSPI module yet), with the
Emscripten version the lock names. turmeric-spices and raylib are checked out
at the lock's `SPICES_REF` and `RAYLIB_REF` under `.engine-deps/` (or name
your own with `ARCADE_SPICES=` / `ARCADE_RAYLIB=`).

### Setting up from scratch

You need [just](https://github.com/casey/just), git, cmake, make, python3 and
Node 22. Emscripten is installed by the steps below; a system `emcc` (Homebrew's,
say) is not used once `just emsdk` has run, because turmeric's build wants the
SDK's own layout.

```sh
git clone https://github.com/turmeric-lang/turmeric ../turmeric   # once; a bare repo works too
just checkout-turmeric    # turmeric at engine.lock's commit (a worktree in .engine-deps/turmeric if ../turmeric is bare)
just emsdk                # the pinned Emscripten, into .engine-deps/emsdk
just engine               # builds web/public/engine/ (first build ~1-2 min), from the
                          #   .engine-deps/turmeric checkout if there is one, else ../turmeric
just install              # the site's npm dependencies
npx --prefix web playwright install chromium    # once, for the tests
just dev                  # http://localhost:3100 (never 3000: that is Try Turmeric's)
```

`TURMERIC_DIR=<path>` points every recipe at another turmeric checkout.
If you change `engine.lock`, rerun `just checkout-turmeric`, and `just emsdk`
if the Emscripten version moved. If a build fails with a path from an older
compiler in it, delete `build-wasm/` in the turmeric checkout and rerun.

### Day to day

```sh
just dev       # dev server
just test      # Playwright, in a Chromium with JSPI (just test tests/spices.spec.js for one file)
just build     # dist/client + the Worker
just deploy    # build, then wrangler deploy to play.turmeric-lang.com (needs `npx wrangler login`)
just run 09-pong    # an example natively, with `tur` on PATH
just               # lists every recipe
```

`ARCADE_CHROMIUM=/path/to/chromium just test` runs the suite in another
Chromium than the one Playwright installed. Without `web/public/engine/` the
suite skips with a notice (in CI it fails: a missing engine is a broken
build). The recipes are thin wrappers: `scripts/fetch-engine.sh` and the
`npm` scripts in `web/` work on their own too.

## Layout

```
scripts/engine.lock        the turmeric, turmeric-spices and raylib refs and emsdk version the engine is built from
Justfile                   the common tasks (`just` lists them)
scripts/fetch-engine.sh    builds the engine into web/public/engine/ (with spices/ and spices.js)
scripts/subset-iosevka.sh  regenerates web/fonts/ (the C playground's script, this repo's paths)
examples/                  the Examples menu: one program per file, titled by its ;;; header
web/index.html, main.js    the page: editor, Run/Stop, Examples, console
web/editor.js              Monaco (the textarea stays the editor if it fails to load)
web/editor-language.js     the Turmeric tokenizer, from Try Turmeric's web/editor-language.js
web/editor-palette.json    the Turmeric token colours, a copy of turmeric's web/editor-palette.json
                           (Try's Monaco themes and the VS Code/Vim/Emacs packs carry the same)
web/share.js, share-codec.js  share links: #code= (Try Turmeric's format), kept current, Share copies it;
                           ?example=NAME[&run] for an unedited example
web/spices-menu.js         the Spices menu: ticks declare a spice in the program's defscript header
web/defscript.js           reads and rewrites that header (pinned to the engine's turmeric-spices commit)
web/lsp-client.js          the Monaco adapter for `tur lsp`, from Try's (its worker URL an option);
                           the server is engine/lsp-worker.js, started on the editor's first focus
web/screen.html, screen.js the screen pane's shell, one run per iframe
web/examples.js            reads examples/ into the menu at build time
web/public/theme.js        light/dark before first paint (Try Turmeric's switch); the OS's until picked
web/fonts/                 Iosevka 400/600, subset by scripts/subset-iosevka.sh (from @fontsource/iosevka):
                           the face of the whole page, editor included
web/public/favicon.svg     the TA badge (Iosevka's T and A as paths), also the toolbar's logo
web/storage.js, split.js   localStorage that cannot break the page, and the dividers (both after the C playground's)
web/public/og-image.png    the card a shared link shows; web/public/icons/ the app icons -- both rendered by
                           scripts/images/make-images.mjs (og.html, after turmeric-lang.com's card, and the badge)
scripts/check-pwa.mjs      after a build: what the service worker precaches, and the manifest (CI runs it)
web/csp.js                 the one Content-Security-Policy
web/worker.js              the Cloudflare Worker in front of the static site
web/tests/                 Playwright: run, streaming, Stop, stack overflow, refusals,
                           and the raylib examples themselves
```

## License

MIT, see [LICENSE.md](LICENSE.md).
