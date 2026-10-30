// raylib on the engine (raylib-web-playground-plan P0, steps 1 to 3): the
// quick-start program draws its text in the screen pane, the blocking frame
// loop keeps producing frames because raylib's own sleep suspends under JSPI,
// the page stays live meanwhile, and Stop tears the run down.
//
// The spices each program imports are mounted from the engine's packages
// when it runs (screen.js); the boot line names them.
//
// Needs an engine with raylib in it: web/public/engine as
// scripts/fetch-engine.sh builds it (turmeric's tur_wasm_arcade).  Locally, an
// engine without raylib (a plain JIT module copied in by hand) skips these;
// in CI it fails them, since the engine CI builds always carries raylib.
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const HAVE_ENGINE = existsSync(new URL('../public/engine/turmeric-jit.wasm', import.meta.url));
test.skip(!HAVE_ENGINE && !process.env.CI, 'web/public/engine is not built; run scripts/fetch-engine.sh');

const consoleEl = (page) => page.locator('#console');
// The programs are the Examples menu's own files (examples/), so what the
// menu offers is what this suite runs.
const example = (name) => readFileSync(new URL(`../../examples/${name}.tur`, import.meta.url), 'utf8');

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
    const offered = boot.offered || [];
    const why = `the engine carries no raylib (offered: ${offered.join(', ') || 'none'})`;
    if (process.env.CI) expect(offered, why).toContain('raylib');
    test.skip(!offered.includes('raylib'), why);
    // The program imports raylib, so raylib and its dep math are mounted.
    expect(boot.spices).toEqual(['math', 'raylib']);
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

const HELLO = example('01-hello-raylib');

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
    await run(page, example('02-frame-counter'));
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
    await run(page, example('03-main-loop-callback'));
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
