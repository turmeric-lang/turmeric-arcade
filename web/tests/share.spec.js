// Share links (raylib-web-playground-plan P2): the program rides in the URL
// as #code=<gzip, base64url> -- Try Turmeric's format, so a link from either
// site opens on both -- kept current as the program is edited, and copied to
// the clipboard by Share.
import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';

const PROGRAM = '(defn main [] : int (println "shared: 7.1") 0)\n';

async function open(page, hash = '') {
    await page.goto('/' + hash);
    await page.waitForFunction(() => !!window.arcade);
}
const source = (page) => page.evaluate(() => window.arcade.getSource());

test('the URL follows the program, and a reload brings it back', async ({ page }) => {
    await open(page);
    await page.evaluate((s) => window.arcade.setSource(s), PROGRAM);
    await expect.poll(() => page.evaluate(() => location.hash), { timeout: 5_000 }).toMatch(/^#code=[A-Za-z0-9_-]+$/);
    await page.reload();
    await page.waitForFunction(() => !!window.arcade);
    expect(await source(page)).toBe(PROGRAM);
});

test('Share copies a link that opens the program', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await page.evaluate((s) => window.arcade.setSource(s), PROGRAM);
    await page.click('#share-btn');
    await expect(page.locator('#status')).toHaveText('link copied');
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/#code=[A-Za-z0-9_-]+$/);
    const other = await context.newPage();
    await other.goto(url);
    await other.waitForFunction(() => !!window.arcade);
    expect(await source(other)).toBe(PROGRAM);
});

test('a link in Try Turmeric\'s format opens (gzip, unpadded base64url)', async ({ page }) => {
    const payload = gzipSync(Buffer.from(PROGRAM, 'utf8')).toString('base64url');
    await open(page, `#code=${payload}`);
    expect(await source(page)).toBe(PROGRAM);
});

test('a link that does not decode opens on the default program', async ({ page }) => {
    await open(page, '#code=not-a-real-payload');
    const src = await source(page);
    expect(src).toContain('hello-raylib');
});
