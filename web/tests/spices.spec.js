// The Spices menu (raylib-web-playground-plan 5.3): the engine's spices,
// each a checkbox that declares it in the program's defscript header -- the
// real form, pinned to the turmeric-spices commit the engine's packages came
// from -- and that follows the header when it is edited by hand.
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const HAVE_ENGINE = existsSync(new URL('../public/engine/spices/index.json', import.meta.url));
test.skip(!HAVE_ENGINE && !process.env.CI, 'web/public/engine has no spice packages; run scripts/fetch-engine.sh');

const HELLO = readFileSync(new URL('../../examples/01-hello-raylib.tur', import.meta.url), 'utf8');
const ENGINE = JSON.parse(readFileSync(new URL('../public/engine/engine.json', import.meta.url), 'utf8'));

async function open(page) {
    await page.goto('/');
    await page.waitForFunction(() => !!window.arcade);
    await page.evaluate((s) => window.arcade.setSource(s), HELLO);
    await page.click('#spices > summary');
}
const box = (page, name) => page.locator(`#spice-list input[value="${name}"]`);
const source = (page) => page.evaluate(() => window.arcade.getSource());

test('the menu lists the spices the engine offers, with their descriptions', async ({ page }) => {
    await open(page);
    await expect(page.locator('#spice-list .spice')).toHaveCount(2);
    await expect(page.locator('#spice-list')).toContainText('raylib');
    await expect(page.locator('#spice-list')).toContainText('Raylib graphics and input bindings');
    await expect(page.locator('#spice-list')).toContainText('math');
    await expect(box(page, 'raylib')).not.toBeChecked();
});

test('ticking a spice writes a pinned defscript header, and the program still runs', async ({ page }) => {
    await open(page);
    await box(page, 'raylib').check();
    const src = await source(page);
    expect(src.startsWith('(defscript :spices #map{"raylib" #map{'
        + ':url "https://github.com/turmeric-lang/turmeric-spices" '
        + `:ref "${ENGINE.spices}" :subdir "spices/raylib"}})\n;;; hello-raylib`)).toBe(true);
    await page.evaluate(() => window.arcade.run());
    await page.waitForFunction(() => !!window.arcade.lastBoot, null, { timeout: 45_000 });
    expect((await page.evaluate(() => window.arcade.lastBoot)).spices).toEqual(['math', 'raylib']);
    await expect(page.locator('#console')).toContainText('Device initialized successfully', { timeout: 60_000 });
    await expect(page.locator('#console .err')).toHaveCount(0);
});

test('unticking removes the header, leaving the program as it was', async ({ page }) => {
    await open(page);
    await box(page, 'raylib').check();
    await box(page, 'math').check();
    expect((await source(page)).match(/#map\{:url/g)).toHaveLength(2);
    await box(page, 'raylib').uncheck();
    await box(page, 'math').uncheck();
    expect(await source(page)).toBe(HELLO);
});

test('the boxes follow a header edited by hand', async ({ page }) => {
    await open(page);
    await page.evaluate((s) => window.arcade.setSource(
        '(defscript :spices #map{"math" #map{:path "../math"}})\n' + s), HELLO);
    await expect(box(page, 'math')).toBeChecked();
    await expect(box(page, 'raylib')).not.toBeChecked();
    // Ticking raylib keeps the hand-written math entry as it was.
    await box(page, 'raylib').check();
    const src = await source(page);
    expect(src).toContain('"math" #map{:path "../math"}');
    expect(src).toContain('"raylib" #map{:url');
});
