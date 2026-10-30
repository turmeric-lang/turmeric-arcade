// The editor's language server (raylib-web-playground-plan P2): `tur lsp` in
// the stock module, in the worker that comes with the engine, with the
// engine's spices mounted.  It starts on the editor's first focus, analyses
// the raylib quick start clean -- its raylib imports resolve -- and marks an
// import no spice has, and a call that does not type-check against the
// spice's own signature.
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const HAVE_ENGINE = existsSync(new URL('../public/engine/turmeric.wasm', import.meta.url));
test.skip(!HAVE_ENGINE && !process.env.CI, 'web/public/engine has no language server; run scripts/fetch-engine.sh');

const HELLO = readFileSync(new URL('../../examples/01-hello-raylib.tur', import.meta.url), 'utf8');

async function openWithLsp(page) {
    await page.goto('/');
    await page.waitForFunction(() => !!window.arcade);
    // A click on the text, as a visitor gives it focus: the server starts then.
    await page.locator('.monaco-editor .view-lines').click();
    await expect(page.locator('#lsp-status')).toHaveText('analysis ready', { timeout: 60_000 });
}

// The markers once the server has answered for the current text.
async function markersFor(page, src) {
    await page.evaluate((s) => window.arcade.setSource(s), src);
    await page.waitForTimeout(400);   // past the client's 150 ms didChange debounce
    await page.waitForFunction(() => !window.arcade.lsp.isBusy(), null, { timeout: 30_000 });
    return page.evaluate(() => window.arcade.lsp.markers());
}

test('the language server starts on focus and the raylib quick start is clean', async ({ page }) => {
    await openWithLsp(page);
    expect(await markersFor(page, HELLO)).toEqual([]);
});

test('an import no spice has is marked, naming the module', async ({ page }) => {
    await openWithLsp(page);
    const markers = await markersFor(page, HELLO.replace('raylib/text ', 'raylib/nope '));
    expect(markers.some((m) => m.severity === 8 && /raylib\/nope/.test(m.message)), JSON.stringify(markers))
        .toBe(true);
});

test("a call against a spice's signature is type-checked", async ({ page }) => {
    await openWithLsp(page);
    // draw-text takes a cstr first; an int there is the spice's own type error.
    const markers = await markersFor(page, HELLO.replace('(draw-text "Hello, Turmeric!"', '(draw-text 42'));
    expect(markers.some((m) => m.severity === 8), JSON.stringify(markers)).toBe(true);
    // And back to the original text, clean again.
    expect(await markersFor(page, HELLO)).toEqual([]);
});
