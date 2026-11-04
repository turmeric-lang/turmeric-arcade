// raylib-web-playground-plan P4: the FPS counter, the ?example= deep link,
// and the layout on a phone.
import { test, expect, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const HAVE_ENGINE = existsSync(new URL('../public/engine/turmeric-jit.wasm', import.meta.url));
const example = (file) => readFileSync(new URL(`../../examples/${file}.tur`, import.meta.url), 'utf8');

async function open(page, path = '/') {
    await page.goto(path);
    await page.waitForFunction(() => !!window.arcade);
}
const source = (page) => page.evaluate(() => window.arcade.getSource());
const fps = (page) => page.evaluate(() => window.arcade.lastFps);

test.describe('the FPS counter', () => {
    test.skip(!HAVE_ENGINE && !process.env.CI, 'web/public/engine is not built; run scripts/fetch-engine.sh');

    test('counts the frames a blocking loop draws, and goes when the run stops', async ({ page }) => {
        await open(page);
        await page.evaluate((s) => window.arcade.run(s), example('07-bouncing-ball'));
        // set-target-fps 60: the counter reads near it (headless Chromium in CI
        // is slower, so the band is wide; what matters is that it counts).
        await expect.poll(async () => (await fps(page) || {}).fps || 0, { timeout: 60_000 }).toBeGreaterThan(10);
        const f = await fps(page);
        expect(f.fps).toBeLessThan(90);
        await expect(page.locator('#fps')).toBeVisible();
        await expect(page.locator('#fps')).toHaveText(/^\d+ fps$/);
        // Frames keep coming: the count grows.
        await expect.poll(async () => (await fps(page)).frames, { timeout: 5_000 }).toBeGreaterThan(f.frames);
        await page.click('#stop-btn');
        await expect(page.locator('#fps')).toBeHidden();
    });

    test('counts a frame callback too, after main has returned', async ({ page }) => {
        await open(page);
        await page.evaluate((s) => window.arcade.run(s), example('08-bouncing-ball-callback'));
        await expect(page.locator('#console .engine')).toContainText('main loop running', { timeout: 60_000 });
        await expect.poll(async () => (await fps(page) || {}).fps || 0, { timeout: 15_000 }).toBeGreaterThan(10);
    });

    test('a program that draws nothing shows no counter', async ({ page }) => {
        await open(page);
        await page.evaluate(() => window.arcade.run('(defn main [] : int (println "no screen") 0)'));
        await expect(page.locator('#console')).toContainText('no screen', { timeout: 60_000 });
        await expect(page.locator('#console .engine')).toContainText('compiled', { timeout: 30_000 });
        await page.waitForTimeout(1200);
        await expect(page.locator('#fps')).toBeHidden();
        expect(await fps(page)).toBeNull();
    });
});

test.describe('the ?example= deep link', () => {
    test('opens on the example it names, without running it', async ({ page }) => {
        await open(page, '/?example=pong');
        expect(await source(page)).toBe(example('09-pong'));
        expect(await page.locator('#examples').inputValue()).toBe('pong');
        await page.waitForTimeout(500);
        await expect(page.locator('#screen-host iframe')).toHaveCount(0);
    });

    test('with &run, runs it on arrival', async ({ page }) => {
        test.skip(!HAVE_ENGINE && !process.env.CI, 'web/public/engine is not built');
        await open(page, '/?example=life&run');
        await expect(page.locator('#console')).toContainText('generation 0: 708', { timeout: 60_000 });
    });

    test('an unknown name says so and opens on the first example', async ({ page }) => {
        await open(page, '/?example=no-such-game');
        await expect(page.locator('#console .err')).toContainText('no example called "no-such-game"');
        expect(await source(page)).toContain('hello-raylib');
    });

    test('picking an example puts its link in the URL; editing it switches to #code=', async ({ page }) => {
        await open(page);
        await page.selectOption('#examples', 'life');
        await expect.poll(() => page.evaluate(() => location.search + location.hash), { timeout: 5_000 })
            .toBe('?example=life');
        await page.evaluate(() => window.arcade.setSource(window.arcade.getSource() + '\n;; mine\n'));
        await expect.poll(() => page.evaluate(() => location.hash), { timeout: 5_000 }).toMatch(/^#code=/);
        // A reload keeps the edit: #code= wins over ?example=.
        await page.reload();
        await page.waitForFunction(() => !!window.arcade);
        expect(await source(page)).toContain(';; mine');
    });

    test('Share gives an untouched example its short link, and an edited one #code=', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await open(page, '/?example=pong');
        await page.click('#share-btn');
        await expect(page.locator('#status')).toHaveText('link copied');
        expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/\?example=pong$/);
        await page.evaluate(() => window.arcade.setSource('(defn main [] : int 0)\n'));
        await page.click('#share-btn');
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/#code=[A-Za-z0-9_-]+$/);
    });
});

// A Pixel 7's viewport, touch and user agent, in the same Chromium (JSPI).
const { defaultBrowserType: _browser, ...PHONE } = devices['Pixel 7'];

test.describe('on a phone', () => {
    test.use(PHONE);

    test('one column: the screen first and full width, the editor, then the console', async ({ page }) => {
        await open(page);
        const box = async (sel) => page.locator(sel).boundingBox();
        const [screen, ed, con] = [await box('#screen-host'), await box('.editor-pane'), await box('#console')];
        const vw = page.viewportSize().width;
        expect(screen.y).toBeLessThan(ed.y);
        expect(ed.y).toBeLessThan(con.y);
        expect(Math.abs(screen.width - vw)).toBeLessThan(2);
        expect(Math.abs(screen.width / screen.height - 16 / 9)).toBeLessThan(0.05);
        expect(ed.height).toBeGreaterThan(200);
        // Nothing runs off the side.
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
        // The toolbar is one row: the badge and title, Run, Stop, the menu.
        const row = await Promise.all(['.brand', '#run-btn', '#stop-btn', '#menu-btn'].map(box));
        for (let i = 1; i < row.length; i++) {
            expect(row[i].x).toBeGreaterThan(row[i - 1].x);
            expect(Math.abs((row[i].y + row[i].height / 2) - (row[0].y + row[0].height / 2))).toBeLessThan(4);
        }
        for (const b of row.slice(1)) expect(b.height).toBeGreaterThanOrEqual(36);
        // The rest is in the menu, closed until the hamburger is tapped.
        await expect(page.locator('#examples')).toBeHidden();
        await page.locator('#menu-btn').tap();
        await expect(page.locator('#menu-btn')).toHaveAttribute('aria-expanded', 'true');
        for (const sel of ['#examples', '#spices > summary', '#share-btn', '#theme-btn']) {
            await expect(page.locator(sel)).toBeVisible();
            expect((await box(sel)).height).toBeGreaterThanOrEqual(36);
        }
        // Picking an example closes it.
        await page.selectOption('#examples', 'pong');
        await expect(page.locator('#examples')).toBeHidden();
        // The status bar stays at the foot of the screen.
        const bar = await box('.statusbar');
        expect(bar.y + bar.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
    });

    test('a tap on the screen reaches the program as a click (Life flips a cell)', async ({ page }) => {
        test.skip(!HAVE_ENGINE && !process.env.CI, 'web/public/engine is not built');
        // Keep the drawing buffer, so a cell can be read back (raylib.spec.js).
        await page.addInitScript(() => {
            const orig = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, attrs) {
                if (type === 'webgl2' || type === 'webgl')
                    attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
                return orig.call(this, type, attrs);
            };
        });
        await open(page, '/?example=life&run');
        await expect(page.locator('#console')).toContainText('generation 0: 708', { timeout: 60_000 });
        const canvas = page.frameLocator('#screen-host iframe').locator('#canvas');
        // Pause (Space is a key, so a tap cannot send it: focus and press),
        // read a cell, tap it, read it again.
        await canvas.tap({ position: { x: 5, y: 5 } });
        // Held for a few frames: raylib samples keys once a frame, and a press
        // and release inside one slow frame is never seen.
        await page.keyboard.down(' ');
        await page.waitForTimeout(150);
        await page.keyboard.up(' ');
        // Paused for certain before a cell is read: the banner (grey text on
        // its own strip at the foot of the grid) is drawn.
        await expect.poll(() => canvas.evaluate((c) => {
            const gl = c.getContext('webgl2');
            const w = 300, h = 12, px = new Uint8Array(w * h * 4);
            gl.readPixels(20, c.height - 262, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
            let grey = 0;
            for (let i = 0; i < px.length; i += 4)
                if (Math.abs(px[i] - 120) < 25 && Math.abs(px[i + 1] - 120) < 25 && Math.abs(px[i + 2] - 120) < 25) grey++;
            return grey;
        }), { timeout: 10_000 }).toBeGreaterThan(30);
        const cell = async () => canvas.evaluate((c) => {
            const gl = c.getContext('webgl2');
            const px = new Uint8Array(4);
            // Cell (0, 0) of the grid: canvas pixel (18, 11), in GL's bottom-up rows.
            gl.readPixels(18, c.height - 1 - 11, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            return px[1] > 100 && px[0] < 100;   // the live colour (30, 120, 80)
        });
        await expect(page.locator('#screen-host iframe')).toHaveCount(1);
        await page.waitForTimeout(500);
        const before = await cell();
        const b = await canvas.boundingBox();
        // The canvas is scaled to the pane: touch where cell (0, 0) is drawn,
        // and hold it for a few frames, as a finger does -- raylib sees a
        // press only if it spans a frame, and page.touchscreen.tap does not.
        const cdp = await page.context().newCDPSession(page);
        const at = { x: b.x + (19 / 480) * b.width, y: b.y + (12 / 270) * b.height };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
        await page.waitForTimeout(150);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(cell, { timeout: 5_000 }).toBe(!before);
    });
});
