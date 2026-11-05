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
        // The indent guides are faint, as Try Turmeric's: close to the
        // canvas, not Monaco's stock grey (#404040 dark, #D3D3D3 light).
        // (Indented deeper than the brackets nest: Monaco draws a bracket-pair
        // guide, not an indent guide, where a bracket's column is.)
        await page.evaluate(() => window.arcade.setSource('(defn main [] : int\n        (println "x")\n        0)\n'));
        await expect.poll(() => page.evaluate(() => {
            const bg = getComputedStyle(document.querySelector('.monaco-editor-background')).backgroundColor;
            const guides = [...document.querySelectorAll('.core-guide')]
                .map((e) => getComputedStyle(e).boxShadow.match(/^rgb\(([^)]*)\)/))
                .filter(Boolean).map((m) => m[1].split(',').map(Number));
            if (!guides.length) return null;
            const b = bg.match(/\d+/g).map(Number);
            return Math.max(...guides.flatMap((g) => g.map((c, i) => Math.abs(c - b[i]))));
        })).toBeLessThan(32);
    });
}

test('if Monaco cannot load, the textarea is the editor, and it is shown', async ({ page }) => {
    await page.route(/monaco-editor/, (route) => route.abort());
    await page.goto('/');
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'textarea');
    await expect(page.locator('#editor-pane')).toHaveAttribute('data-editor', 'ready');
    await expect(page.locator('#editor')).toBeVisible();
    expect(await page.locator('#editor').inputValue()).toContain('hello-raylib');
    // A textarea has no minimap, so no button for one.
    await expect(page.locator('#minimap-btn')).toBeHidden();
});

// The minimap (minimap.js): on where the editor is wide enough for it, off
// where it is not, and the visitor's choice, once made, wins and is kept.
const minimap = (page) => page.evaluate(() => window.arcade.minimap());
async function openMonaco(page) {
    await page.goto('/');
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
}

test('the minimap shows beside a wide editor; the button hides it, and that is kept', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openMonaco(page);
    const btn = page.locator('#minimap-btn');
    await expect.poll(async () => (await minimap(page)).on).toBe(true);
    await expect(page.locator('.monaco-editor .minimap')).toBeVisible();
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(btn).toHaveAttribute('title', 'Hide the minimap');
    await btn.click();
    expect(await minimap(page)).toEqual({ on: false, preference: false });
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
    await page.waitForTimeout(300);
    expect(await minimap(page)).toEqual({ on: false, preference: false });
    await page.locator('#minimap-btn').click();
    expect(await minimap(page)).toEqual({ on: true, preference: true });
});

test('a narrow editor starts without it, and goes back to the width rule when widened', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await openMonaco(page);
    await page.waitForTimeout(300);
    expect(await minimap(page)).toEqual({ on: false, preference: null });
    await expect(page.locator('#minimap-btn')).toHaveAttribute('aria-pressed', 'false');
    // Wider window, wider editor: the width rule turns it on by itself.
    await page.setViewportSize({ width: 1400, height: 700 });
    await expect.poll(async () => (await minimap(page)).on).toBe(true);
    // Back to narrow, it goes again -- no choice has been made.
    await page.setViewportSize({ width: 1000, height: 700 });
    await expect.poll(async () => (await minimap(page)).on).toBe(false);
    // Asked for, it stays, narrow or not.
    await page.locator('#minimap-btn').click();
    expect(await minimap(page)).toEqual({ on: true, preference: true });
});
