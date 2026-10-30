// raylib on the engine (raylib-web-playground-plan P0, steps 1 to 3): the
// quick-start program draws its text in the screen pane, the blocking frame
// loop keeps producing frames because raylib's own sleep suspends under JSPI,
// the page stays live meanwhile, and Stop tears the run down.
//
// Needs an engine with raylib in it (web/public/engine built by
// tools/wasm-jit-spike/arcade/build.sh in turmeric); with a plain engine the
// boot line names no spices and the suite skips.
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const HAVE_ENGINE = existsSync(new URL('../public/engine/turmeric-jit.wasm', import.meta.url));
test.skip(!HAVE_ENGINE && !process.env.CI, 'web/public/engine is not built; run scripts/fetch-engine.sh');

const consoleEl = (page) => page.locator('#console');

async function open(page) {
    // Keep the WebGL drawing buffer between frames in every frame of the page
    // (the screen iframe included), so readFrame can read what raylib drew.
    // raylib's GLFW port builds its own context attributes, which is why this
    // is done here and not through the module.
    await page.addInitScript(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, attrs) {
            if (type === 'webgl2' || type === 'webgl')
                attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
            return orig.call(this, type, attrs);
        };
    });
    await page.goto('/');
    await page.waitForFunction(() => !!window.arcade);
}
const run = (page, src) => page.evaluate((s) => window.arcade.run(s), src);

// Waits for the engine's boot line; skips the test when the engine has no
// raylib (a plain JIT module).
async function bootedWithRaylib(page) {
    await page.waitForFunction(() => !!window.arcade.lastBoot, null, { timeout: 45_000 });
    const boot = await page.evaluate(() => window.arcade.lastBoot);
    expect(boot.ok, boot.error).toBe(true);
    test.skip(!(boot.spices || []).includes('raylib'),
              `the engine carries no raylib (spices: ${(boot.spices || []).join(', ') || 'none'})`);
}

// The frame as raylib left it: a pixel of the clear colour and whether any
// pixel in a box is dark (text).  Read in the iframe, from the WebGL context
// (preserveDrawingBuffer, screen.js).
async function readFrame(page, box) {
    return page.frameLocator('#screen-host iframe').locator('#canvas').evaluate((c, b) => {
        const gl = c.getContext('webgl2');
        if (!gl) return { error: 'no webgl2 context' };
        const bg = new Uint8Array(4);
        gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bg);
        const [x, y, w, h] = b;
        const px = new Uint8Array(w * h * 4);
        // GL rows run bottom-up.
        gl.readPixels(x, c.height - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let dark = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] < 200) dark++;
        return { bg: [...bg], dark, width: c.width, height: c.height };
    }, box);
}

const HELLO = `(defmodule hello
  (export)
  (import raylib/core  :refer [init-window window-should-close begin-drawing
                               end-drawing clear-background])
  (import raylib/text  :refer [draw-text])
  (import raylib/color :refer [raywhite black])
  (defn main [] : int
    (init-window 480 270 "hello")
    (while (not (window-should-close))
      (begin-drawing)
      (clear-background (raywhite))
      (draw-text "Hello, Turmeric!" 120 120 20 (black))
      (end-drawing))
    0))`;

test('the quick-start program draws its text (struct by value: Color)', async ({ page }) => {
    await open(page);
    await run(page, HELLO);
    await bootedWithRaylib(page);
    // raylib's own log reaches the console: the window and the GL device.
    await expect(consoleEl(page)).toContainText('Device initialized successfully', { timeout: 60_000 });
    await expect(consoleEl(page)).not.toContainText('Error');
    // A few frames in, the clear colour is RAYWHITE (245,245,245) and the
    // text box has dark pixels.
    await expect.poll(async () => (await readFrame(page, [120, 120, 200, 24])).dark, { timeout: 15_000 })
        .toBeGreaterThan(50);
    const f = await readFrame(page, [120, 120, 200, 24]);
    expect(f.width).toBe(480);
    expect(f.height).toBe(270);
    expect(f.bg.slice(0, 3)).toEqual([245, 245, 245]);
    // The loop is still running (not done, not trapped): no engine line yet.
    expect(await consoleEl(page).locator('.engine, .err').count()).toBe(0);
});

test('the blocking loop yields every frame under JSPI and Stop ends it', async ({ page }) => {
    await open(page);
    await run(page, `(defmodule frames
  (export)
  (import raylib/core  :refer [init-window window-should-close begin-drawing
                               end-drawing clear-background])
  (import raylib/color :refer [raywhite])
  (defn main [] : int
    (init-window 480 270 "frames")
    (let [^mut n 0]
      (while (not (window-should-close))
        (begin-drawing)
        (clear-background (raywhite))
        (end-drawing)
        (set! n (+ n 1))
        (when (= 0 (mod n 30)) (println n))))
    0))`);
    await bootedWithRaylib(page);
    // Lines arrive while the loop runs: each is 30 frames later than the last,
    // so the loop is yielding (raylib's sleep suspends) rather than blocking.
    await expect(consoleEl(page)).toContainText('\n60', { timeout: 60_000 });
    const t0 = Date.now();
    await expect(consoleEl(page)).toContainText('\n120', { timeout: 30_000 });
    const msFor60Frames = Date.now() - t0;
    console.log(`60 frames of an empty raylib loop took ${msFor60Frames} ms`);
    expect(await consoleEl(page).locator('.engine, .err').count()).toBe(0);
    await page.click('#stop-btn');
    await expect(page.locator('#screen-host iframe')).toHaveCount(0);
    await expect(consoleEl(page)).toContainText('-- stopped');
});

test('callback mode: run-main-loop keeps drawing after main has unwound', async ({ page }) => {
    await open(page);
    await run(page, `(defmodule cb
  (export)
  (import raylib/core  :refer [init-window begin-drawing end-drawing clear-background])
  (import raylib/color :refer [raywhite])
  (import raylib/web   :refer [run-main-loop])
  (def ^mut n 0)
  (defn main [] : int
    (init-window 480 270 "cb")
    (run-main-loop (fn [] : unit
                     (begin-drawing)
                     (clear-background (raywhite))
                     (end-drawing)
                     (set! n (+ n 1))
                     (when (= 0 (mod n 30)) (println n)))
                   0)
    (println "after run-main-loop")
    0))`);
    await bootedWithRaylib(page);
    // emscripten_set_main_loop(..., 1) unwinds out of main: the shell reports
    // that as the loop running, not as a trap or an exit ...
    await expect(consoleEl(page).locator('.engine')).toContainText('main loop running', { timeout: 60_000 });
    await expect(consoleEl(page)).not.toContainText('after run-main-loop');
    // ... and the browser calls the interpreted closure every frame after.
    await expect(consoleEl(page)).toContainText('\n90', { timeout: 30_000 });
    expect(await consoleEl(page).locator('.err').count()).toBe(0);
    await expect(page.locator('#status')).toHaveText('running');
    await page.click('#stop-btn');
    await expect(page.locator('#screen-host iframe')).toHaveCount(0);
});

test('cost: a raylib program that returns prints its engine line', async ({ page }) => {
    await open(page);
    const t0 = Date.now();
    await run(page, `(defmodule cost
  (export)
  (import raylib/core  :refer [init-window begin-drawing end-drawing clear-background])
  (import raylib/text  :refer [draw-text])
  (import raylib/color :refer [raywhite black])
  (defn main [] : int
    (init-window 480 270 "cost")
    (let [^mut n 0]
      (while (< n 30)
        (begin-drawing)
        (clear-background (raywhite))
        (draw-text "frame" 10 10 20 (black))
        (end-drawing)
        (set! n (+ n 1))))
    0))`);
    await bootedWithRaylib(page);
    await expect(consoleEl(page)).toContainText('Device initialized successfully', { timeout: 60_000 });
    const firstFrameMs = Date.now() - t0;
    await expect(consoleEl(page).locator('.engine')).toContainText('compiled', { timeout: 30_000 });
    const line = await consoleEl(page).locator('.engine').last().textContent();
    console.log(`cost: Run to raylib's device line ${firstFrameMs} ms (engine boot included); ${line}`);
    expect(line).toMatch(/^compiled -- front \d+ ms, c2mir \d+ ms, run \d+ ms$/);
});
