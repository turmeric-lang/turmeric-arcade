// The screen pane, end to end: a program runs in its iframe on the JSPI
// engine, its lines reach the console as it prints them, Stop tears the
// iframe down, and a stack overflow is reported as one.
//
// Needs web/public/engine/ (scripts/fetch-engine.sh).  Without it the suite
// is skipped with a notice, except in CI, where a missing engine is a broken
// build.
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const HAVE_ENGINE = existsSync(new URL('../public/engine/turmeric-jit.wasm', import.meta.url));
test.skip(!HAVE_ENGINE && !process.env.CI,
          'web/public/engine is not built; run scripts/fetch-engine.sh');

const consoleEl = (page) => page.locator('#console');
const engineLines = (page) => page.locator('#console .engine, #console .err');

async function open(page) {
    await page.goto('/');
    await page.waitForFunction(() => !!window.arcade);
}
const run = (page, src) => page.evaluate((s) => window.arcade.run(s), src);

const NAP = `(defn nap [ms : int] : void
  \`\`\`c
  extern void emscripten_sleep(unsigned int);
  emscripten_sleep((unsigned int)ms);
  \`\`\`)
`;

test('runs a program on the engine and prints the engine line', async ({ page }) => {
    await open(page);
    await run(page, '(defn main [] : int (println "hello, arcade") (println (+ 40 2)) 0)');
    await expect(consoleEl(page)).toContainText('hello, arcade', { timeout: 45_000 });
    await expect(consoleEl(page)).toContainText('42');
    await expect(consoleEl(page).locator('.engine').last()).toContainText('compiled');
    await expect(consoleEl(page)).not.toContainText('Error');
    // The screen is JSPI-capable, or a frame loop could not yield.
    await expect(page.locator('#status')).not.toContainText('no JSPI');
});

test('a sleeping frame loop streams its lines while it runs', async ({ page }) => {
    await open(page);
    await run(page, NAP + `(defn main [] : int
  (let [^mut frame 0 ^mut x 7.1]
    (while (< frame 6)
      (nap 250)
      (set! x (+ x 0.25))
      (println x)
      (set! frame (+ frame 1)))
    0))`);
    // The first line shows up long before main returns: the run is suspended
    // at each nap, not blocking the iframe until the end.
    await expect(consoleEl(page)).toContainText('7.35', { timeout: 45_000 });
    expect(await engineLines(page).count()).toBe(0);
    await expect(consoleEl(page)).toContainText('8.6');
    await expect(consoleEl(page).locator('.engine').last()).toContainText('compiled');
    const lines = await consoleEl(page).locator('.line').allTextContents();
    expect(lines.filter((l) => /^\d/.test(l))).toEqual(['7.35', '7.6', '7.85', '8.1', '8.35', '8.6']);
});

test('Stop tears the screen down', async ({ page }) => {
    await open(page);
    await run(page, NAP + `(defn main [] : int
  (let [^mut i 0]
    (while true
      (nap 50)
      (println i)
      (set! i (+ i 1)))
    0))`);
    await expect(consoleEl(page)).toContainText('3', { timeout: 45_000 });
    await expect(page.locator('#screen-host iframe')).toHaveCount(1);
    await page.click('#stop-btn');
    await expect(page.locator('#screen-host iframe')).toHaveCount(0);
    await expect(consoleEl(page)).toContainText('-- stopped');
    // Nothing more arrives from a removed iframe.
    const n = await consoleEl(page).locator('.line').count();
    await page.waitForTimeout(400);
    expect(await consoleEl(page).locator('.line').count()).toBe(n);
    await expect(page.locator('#stop-btn')).toBeDisabled();
});

test('a recursion too deep is reported as a stack overflow', async ({ page }) => {
    await open(page);
    await run(page, `(defn deep [n : int] : int (if (= n 0) 0 (+ 1 (deep (- n 1)))))
(defn main [] : int (println (deep 200000)) 0)`);
    await expect(consoleEl(page).locator('.err').last()).toContainText('stack overflow', { timeout: 45_000 });
    // And the next Run gets a fresh engine, in a fresh iframe.
    await page.evaluate(() => window.arcade.clearConsole());
    await run(page, '(defn main [] : int (println "again") 0)');
    await expect(consoleEl(page)).toContainText('again', { timeout: 45_000 });
});
