// A browser without JSPI (raylib-web-playground-plan J4, option (b)): the
// engine is a JSPI build and cannot load there, so the page says so and turns
// Run off, and everything that needs no engine still works.  Simulated by
// removing WebAssembly.Suspending before the page's scripts run.
import { test, expect } from '@playwright/test';

async function open(page, { jspi }) {
    if (!jspi) {
        await page.addInitScript(() => {
            delete WebAssembly.Suspending;
            delete WebAssembly.promising;
        });
    }
    await page.goto('/');
    await page.waitForFunction(() => !!window.arcade);
}

test('without JSPI: a banner says why, and Run is off', async ({ page }) => {
    await open(page, { jspi: false });
    await expect(page.locator('#no-jspi')).toBeVisible();
    await expect(page.locator('#no-jspi')).toContainText('JSPI');
    await expect(page.locator('#run-btn')).toBeDisabled();
    await expect(page.locator('#run-btn')).toHaveAttribute('title', /Chrome or Edge 137/);
    // A run asked for anyway (Ctrl+Enter, the API) is refused with the reason,
    // and no engine iframe is made.
    await page.evaluate(() => window.arcade.run());
    await expect(page.locator('#console .err')).toContainText('no JSPI');
    await expect(page.locator('#screen-host iframe')).toHaveCount(0);
});

test('without JSPI the editor, examples and sharing still work', async ({ page }) => {
    await open(page, { jspi: false });
    expect(await page.evaluate(() => window.arcade.editorKind)).toBe('monaco');
    await page.selectOption('#examples', 'fibonacci');
    expect(await page.evaluate(() => window.arcade.getSource())).toContain('(fib 27)');
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#code=/);
});

test('with JSPI there is no banner and Run is on', async ({ page }) => {
    await open(page, { jspi: true });
    await expect(page.locator('#no-jspi')).toBeHidden();
    await expect(page.locator('#run-btn')).toBeEnabled();
});
