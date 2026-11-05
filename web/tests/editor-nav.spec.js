// Getting around the program (raylib-web-playground-plan, editor phase items
// 2 and 3): the Symbols panel, which lists what the program defines from the
// language server, and the Run button's shortcut drawn as keycaps.
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const HAVE_LSP = existsSync(new URL('../public/engine/turmeric.wasm', import.meta.url));

async function open(page, path = '/') {
    await page.goto(path);
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
}
const outline = (page) => page.evaluate(() => window.arcade.outline());

test.describe('the Symbols panel', () => {
    test.skip(!HAVE_LSP && !process.env.CI, 'web/public/engine has no language server; run scripts/fetch-engine.sh');

    test('lists what the program defines, in file order, and a row jumps there', async ({ page }) => {
        await open(page, '/?example=pong');
        await page.click('#symbols > summary');
        await expect.poll(async () => (await outline(page)).state, { timeout: 60_000 }).toBe('ok');
        const rows = (await outline(page)).rows;
        const names = rows.map((r) => r.name);
        // pong's own definitions, in the order the file has them.
        const want = ['key-space', 'width', 'pad-speed', 'radius', 'move-paddle', 'hits?', 'score-line', 'main'];
        expect(want.every((n) => names.includes(n))).toBe(true);
        expect(want.map((n) => names.indexOf(n))).toEqual([...want.map((n) => names.indexOf(n))].sort((a, b) => a - b));
        expect(rows.find((r) => r.name === 'move-paddle').kind).toBe('function');
        expect(rows.find((r) => r.name === 'width').kind).toBe('value');
        // A row puts the caret on the definition and closes the panel.
        await page.locator('#symbols-list .symbol-item', { hasText: 'hits?' }).click();
        await expect(page.locator('#symbols')).not.toHaveAttribute('open', '');
        const line = await page.evaluate(() => window.arcade.getSource().split('\n')
            .findIndex((l) => l.includes('(defn hits?')) + 1);
        await expect(page.locator('#cursor-pos')).toHaveText(new RegExp(`^Ln ${line}, `));
        // Opened again, the definition the caret is in is marked.
        await page.click('#symbols > summary');
        await expect.poll(async () => (await outline(page)).rows.filter((r) => r.current).map((r) => r.name),
                          { timeout: 30_000 }).toEqual(['hits?']);
        // A click elsewhere closes it; so does Escape.
        await page.locator('#console').click();
        await expect(page.locator('#symbols')).not.toHaveAttribute('open', '');
        await page.click('#symbols > summary');
        await page.keyboard.press('Escape');
        await expect(page.locator('#symbols')).not.toHaveAttribute('open', '');
    });

    test('its last row names the shortcut and opens Monaco\'s filterable list', async ({ page }) => {
        await open(page, '/?example=pong');
        await page.click('#symbols > summary');
        const filter = page.locator('#symbols-list .symbol-filter');
        await expect(filter).toContainText('Filter');
        await expect(filter.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'O']);
        // Clicked at once, before the language server is up: it waits for it.
        await filter.click();
        await expect(page.locator('.quick-input-widget')).toBeVisible({ timeout: 60_000 });
        await expect(page.locator('.quick-input-widget')).toContainText('key-space', { timeout: 30_000 });
    });

    test('a program that defines nothing says so', async ({ page }) => {
        await open(page);
        await page.evaluate(() => window.arcade.setSource(';; nothing here yet\n'));
        await page.click('#symbols > summary');
        await expect.poll(async () => (await outline(page)).state, { timeout: 60_000 }).toBe('empty');
        await expect(page.locator('#symbols-list .symbols-empty')).toHaveText('Nothing defined yet.');
    });
});

test('without Monaco there is no Symbols panel', async ({ page }) => {
    await page.route(/monaco-editor/, (route) => route.abort());
    await page.goto('/');
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'textarea');
    await expect(page.locator('#symbols')).toBeHidden();
});

test.describe("the Run button's shortcut", () => {
    test('is drawn as keycaps on a wide screen, and named for assistive tech', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await open(page);
        const caps = page.locator('#run-btn .run-kbd kbd');
        await expect(caps).toHaveCount(2);
        await expect(caps.first()).toHaveText('Ctrl');
        await expect(caps.nth(1).locator('svg use')).toHaveAttribute('href', '#i-enter');
        await expect(page.locator('#run-btn')).toHaveAttribute('aria-keyshortcuts', 'Control+Enter');
        await expect(page.locator('#run-btn')).toHaveAttribute('title', 'Run (Ctrl+Enter)');
        // Where the toolbar is tight, it goes; the toolbar still fits.
        await page.setViewportSize({ width: 860, height: 720 });
        await expect(page.locator('#run-btn .run-kbd')).toBeHidden();
        const [sw, vw] = await page.evaluate(() => [document.querySelector('.toolbar').scrollWidth, window.innerWidth]);
        expect(sw).toBeLessThanOrEqual(vw);
    });

    test('says Cmd on a Mac', async ({ page }) => {
        await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
        await open(page);
        await expect(page.locator('#run-btn .kbd-mod svg use')).toHaveAttribute('href', '#i-command');
        await expect(page.locator('#run-btn')).toHaveAttribute('aria-keyshortcuts', 'Meta+Enter');
    });
});
