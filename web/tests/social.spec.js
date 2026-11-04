// The card a shared link shows and the icons an install takes
// (raylib-web-playground-plan P5). The service worker is a build's only;
// scripts/check-pwa.mjs checks it after `npm run build`.
import { test, expect } from '@playwright/test';

test('the page carries Open Graph and Twitter tags for its card', async ({ page }) => {
    await page.goto('/');
    const meta = (sel) => page.locator(sel).getAttribute('content');
    expect(await meta('meta[property="og:title"]')).toBe('Turmeric Arcade: write games in Turmeric, run anywhere');
    expect(await meta('meta[property="og:image"]')).toBe('https://play.turmeric-lang.com/og-image.png');
    expect(await meta('meta[property="og:image:width"]')).toBe('1200');
    expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('/icons/apple-touch-icon.png');
});

test('the card and the icons are served at their sizes', async ({ page, request }) => {
    for (const [url, w, h] of [['/og-image.png', 1200, 630], ['/icons/icon-192.png', 192, 192],
                               ['/icons/icon-512.png', 512, 512], ['/icons/icon-maskable-512.png', 512, 512],
                               ['/icons/apple-touch-icon.png', 180, 180]]) {
        const r = await request.get(url);
        expect(r.status(), url).toBe(200);
        const png = await r.body();
        // A PNG's IHDR: width and height, big-endian, at bytes 16 and 20.
        expect([png.readUInt32BE(16), png.readUInt32BE(20)], url).toEqual([w, h]);
    }
});
