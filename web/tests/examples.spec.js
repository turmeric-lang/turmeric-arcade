// The section 8 examples (raylib-web-playground-plan P3), each run from its
// own file in examples/ as the Examples menu offers it, and checked for what
// it is there to show: the ball moves, Space serves, Life's counts match a
// native run's, raygui's panel and picker draw, the ECS world fills the pane.
//
// Each was also run natively, from the same file, with
// `tur --enable=script-deps run` (the header names its spices); the counts
// Life prints below are the native run's.
//
// Needs an engine with raylib, raygui, ecs and ecs-raylib in it:
// web/public/engine as scripts/fetch-engine.sh builds it.  Locally an engine
// without them skips; in CI it fails.
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const HAVE_ENGINE = existsSync(new URL('../public/engine/turmeric-jit.wasm', import.meta.url));
test.skip(!HAVE_ENGINE && !process.env.CI, 'web/public/engine is not built; run scripts/fetch-engine.sh');

const consoleEl = (page) => page.locator('#console');
const example = (name) => readFileSync(new URL(`../../examples/${name}.tur`, import.meta.url), 'utf8');

async function open(page) {
    // Keep the WebGL drawing buffer between frames, so a frame can be read
    // back (raylib.spec.js says why it is done here).
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

// Runs an example and waits for the engine to boot with `spices` mounted
// (skipping when the engine does not offer them) and for raylib's window.
async function runExample(page, name, spices) {
    await open(page);
    await page.evaluate((s) => window.arcade.run(s), example(name));
    await page.waitForFunction(() => !!window.arcade.lastBoot, null, { timeout: 45_000 });
    const boot = await page.evaluate(() => window.arcade.lastBoot);
    expect(boot.ok, boot.error).toBe(true);
    const offered = boot.offered || [];
    const missing = spices.filter((s) => !offered.includes(s));
    const why = `the engine does not offer ${missing.join(', ')} (offered: ${offered.join(', ') || 'none'})`;
    if (process.env.CI) expect(missing, why).toEqual([]);
    test.skip(missing.length > 0, why);
    expect([...boot.spices].sort()).toEqual([...spices].sort());
    await expect(consoleEl(page)).toContainText('Device initialized successfully', { timeout: 60_000 });
}

const canvas = (page) => page.frameLocator('#screen-host iframe').locator('#canvas');

// Pixels of the frame within `tol` of `rgb`: their count and centroid.
async function find(page, rgb, tol = 12) {
    return canvas(page).evaluate((c, [want, t]) => {
        const gl = c.getContext('webgl2');
        if (!gl) return { error: 'no webgl2 context' };
        const px = new Uint8Array(c.width * c.height * 4);
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let n = 0, sx = 0, sy = 0;
        for (let i = 0; i < px.length; i += 4) {
            if (Math.abs(px[i] - want[0]) <= t && Math.abs(px[i + 1] - want[1]) <= t &&
                Math.abs(px[i + 2] - want[2]) <= t) {
                const p = i / 4;
                n++; sx += p % c.width; sy += c.height - 1 - Math.floor(p / c.width);   // GL rows run bottom-up
            }
        }
        return n ? { n, x: sx / n, y: sy / n } : { n };
    }, [rgb, tol]);
}

// A key press the program sees: the canvas has focus inside the iframe, and
// the key is held for a few frames, since raylib samples keys once a frame.
async function press(page, key) {
    await canvas(page).click({ position: { x: 470, y: 260 } });
    await page.keyboard.down(key);
    await page.waitForTimeout(150);
    await page.keyboard.up(key);
}

const noErrors = async (page) => expect(await consoleEl(page).locator('.err').count()).toBe(0);
const ORANGE = [255, 161, 0];

test('bouncing-ball: the ball moves, and R puts it back', async ({ page }) => {
    await runExample(page, '07-bouncing-ball', ['math', 'raylib']);
    await expect.poll(async () => (await find(page, ORANGE)).n, { timeout: 15_000 }).toBeGreaterThan(200);
    const a = await find(page, ORANGE);
    await page.waitForTimeout(500);
    const b = await find(page, ORANGE);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(20);
    await page.waitForTimeout(1500);
    await press(page, 'r');
    // Back near (240, 100) within a few frames of the reset.
    await expect.poll(async () => {
        const c = await find(page, ORANGE);
        return Math.hypot(c.x - 240, c.y - 100);
    }, { timeout: 5_000 }).toBeLessThan(40);
    await noErrors(page);
});

test('bouncing-ball-callback: main returns and the browser keeps calling the frame', async ({ page }) => {
    await runExample(page, '08-bouncing-ball-callback', ['math', 'raylib']);
    await expect(consoleEl(page).locator('.engine')).toContainText('main loop running', { timeout: 60_000 });
    await expect.poll(async () => (await find(page, ORANGE)).n, { timeout: 15_000 }).toBeGreaterThan(200);
    const a = await find(page, ORANGE);
    await page.waitForTimeout(500);
    const b = await find(page, ORANGE);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(20);
    await noErrors(page);
});

test('pong: the paddles draw, Space serves and the ball leaves the centre', async ({ page }) => {
    await runExample(page, '09-pong', ['math', 'raylib']);
    const PADDLE = [40, 60, 160], BALL = [230, 90, 30];
    await expect.poll(async () => (await find(page, PADDLE)).n, { timeout: 15_000 }).toBeGreaterThan(2 * 8 * 48 - 50);
    const still = await find(page, BALL);
    expect(Math.hypot(still.x - 240, still.y - 135)).toBeLessThan(4);
    await press(page, ' ');
    await expect.poll(async () => {
        const b = await find(page, BALL);
        return b.n ? Math.abs(b.x - 240) : 0;
    }, { timeout: 5_000 }).toBeGreaterThan(30);
    await noErrors(page);
});

test("life: the page's live counts are a native run's", async ({ page }) => {
    await runExample(page, '10-life', ['math', 'raylib']);
    // From the fixed seed: these are what `tur --enable=script-deps run
    // 10-life.tur` prints natively.
    await expect(consoleEl(page)).toContainText('generation 0: 708', { timeout: 30_000 });
    await expect(consoleEl(page)).toContainText('generation 60: 205', { timeout: 60_000 });
    const t0 = Date.now();
    await expect(consoleEl(page)).toContainText('generation 120: 151', { timeout: 60_000 });
    console.log(`life: 60 generations of 64x36 took ${Date.now() - t0} ms on the page`);
    expect((await find(page, [30, 120, 80])).n).toBeGreaterThan(100);
    await noErrors(page);
});

test("raygui-tuner: raygui's panel and colour picker draw beside the ball", async ({ page }) => {
    await runExample(page, '11-raygui-tuner', ['math', 'raylib', 'raygui']);
    await expect.poll(async () => (await find(page, ORANGE, 6)).n, { timeout: 15_000 }).toBeGreaterThan(200);
    // The panel (230,230,235) on the left, and raygui's own drawing in it:
    // the picker's hue bar has a pure red top and a pure blue band.
    const panel = await find(page, [230, 230, 235], 2);
    expect(panel.n).toBeGreaterThan(5000);
    expect(panel.x).toBeLessThan(140);
    expect((await find(page, [255, 0, 0], 30)).n).toBeGreaterThan(5);
    expect((await find(page, [0, 0, 255], 40)).n).toBeGreaterThan(5);
    // The ball stays in the court.
    expect((await find(page, ORANGE, 6)).x).toBeGreaterThan(140);
    await noErrors(page);
});

test('ecs-circles: 200 entities drawn by the macro-written systems, and they move', async ({ page }) => {
    await runExample(page, '12-ecs-circles', ['math', 'raylib', 'ecs', 'ecs-raylib']);
    const BLUE = [0, 121, 241];
    await expect.poll(async () => (await find(page, BLUE, 6)).n, { timeout: 30_000 }).toBeGreaterThan(500);
    const a = await find(page, BLUE, 6);
    await page.waitForTimeout(500);
    const b = await find(page, BLUE, 6);
    expect(Math.abs(b.x - a.x) + Math.abs(b.y - a.y)).toBeGreaterThan(0.5);
    await noErrors(page);
});
