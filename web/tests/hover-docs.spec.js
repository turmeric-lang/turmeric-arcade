// Hover docs (hover-docs.js): the language server's hover gives a name's
// type; the line of documentation under it comes from the doc table the
// engine ships (engine/doc-names.json, turmeric's doc-names.py).
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const HAVE_DOCS = existsSync(new URL('../public/engine/doc-names.json', import.meta.url));
test.skip(!HAVE_DOCS && !process.env.CI, 'web/public/engine has no doc-names.json; run scripts/fetch-engine.sh');

const hover = (page) => page.locator('.monaco-hover:not(.hidden)');

async function hoverOn(page, text) {
    await page.mouse.move(0, 0);
    await expect(hover(page)).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
    const tok = page.locator('.monaco-editor .view-line span span', { hasText: text }).last();
    await tok.scrollIntoViewIfNeeded();
    await tok.hover();
    await expect(hover(page)).toBeVisible({ timeout: 15_000 });
    return hover(page);
}

test.beforeEach(async ({ page }) => {
    await page.goto('/?example=bouncing-ball');
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
});

test("a raylib function's hover has its type and its line from the raylib docs", async ({ page }) => {
    await page.click('.monaco-editor .view-lines');
    await expect(page.locator('#lsp-status')).toHaveAttribute('data-state', 'idle', { timeout: 60_000 });
    const h = await hoverOn(page, /^\s*draw-circle\s*$/);
    await expect(h).toContainText('(draw-circle : (fn');
    await expect(h).toContainText('draw a filled circle');
    await expect(h).toContainText("from the raylib spice's docs");
});

test("a builtin's hover has its line from the stdlib docs", async ({ page }) => {
    await page.evaluate(() => window.arcade.setSource('(defn main [] : int\n  (println "hi")\n  0)\n'));
    const h = await hoverOn(page, /^\s*println\s*$/);
    await expect(h).toContainText('print a value to stdout');
    await expect(h).toContainText('from the stdlib docs');
});

test("a name the program defines itself gets no library line", async ({ page }) => {
    // `clamp` is in the table (the math spice's); here it is the program's.
    await page.evaluate(() => window.arcade.setSource(
        '(defn clamp [x : int] : int x)\n(defn main [] : int\n  (clamp 3))\n'));
    await page.click('.monaco-editor .view-lines');
    await expect(page.locator('#lsp-status')).toHaveAttribute('data-state', 'idle', { timeout: 60_000 });
    // The server's hover is the program's clamp; the math spice's line is not
    // added under it.
    const h = await hoverOn(page, /^\s*clamp\s*$/);
    await expect(h).toContainText('(clamp : (fn [int] : int))');
    await page.waitForTimeout(1_000);
    await expect(h).not.toContainText('clamp a float value');
    await expect(h).not.toContainText("spice's docs");
});
