// The editor's first paint and its colours: a spinner, not the program's raw
// text, until Monaco is on screen; Turmeric's token colours (editor-palette.json,
// turmeric's web/editor-palette.json) in both themes; and the textarea, shown,
// when Monaco cannot load.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PALETTE = JSON.parse(readFileSync(new URL('../editor-palette.json', import.meta.url), 'utf8'));
const rgb = (hex) => `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;

test('the editor pane says it is loading, then shows Monaco', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('#editor-pane').getAttribute('data-editor')).toMatch(/^(loading|ready)$/);
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
    await expect(page.locator('#editor-pane')).toHaveAttribute('data-editor', 'ready');
    await expect(page.locator('.editor-loading')).toBeHidden();
    await expect(page.locator('.monaco-editor')).toBeVisible();
});

for (const scheme of ['dark', 'light']) {
    test(`keywords, strings and comments take Turmeric's ${scheme} colours`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/');
        await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
        await page.evaluate(() => window.arcade.setSource(';; note\n(defn main [] : int (println "hi") 0)\n'));
        const colourOf = (text) => page.locator('.monaco-editor .view-line span span', { hasText: text }).first()
            .evaluate((el) => getComputedStyle(el).color);
        const p = PALETTE[scheme];
        await expect.poll(() => colourOf('defn')).toBe(rgb(p.keyword));
        expect(await colourOf('"hi"')).toBe(rgb(p.string));
        expect(await colourOf(';; note')).toBe(rgb(p.comment));
    });
}

test('if Monaco cannot load, the textarea is the editor, and it is shown', async ({ page }) => {
    await page.route(/monaco-editor/, (route) => route.abort());
    await page.goto('/');
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'textarea');
    await expect(page.locator('#editor-pane')).toHaveAttribute('data-editor', 'ready');
    await expect(page.locator('#editor')).toBeVisible();
    expect(await page.locator('#editor').inputValue()).toContain('hello-raylib');
});
