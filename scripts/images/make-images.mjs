// make-images.mjs -- the arcade's social card and app icons, rendered in
// Chromium from sources in this directory and web/public/favicon.svg (the TA
// badge), into web/public/:
//
//   og-image.png                 1200x630, og.html (variant b; see its header)
//   icons/icon-192.png, -512     the badge as it is (rounded, transparent corners)
//   icons/icon-maskable-512.png  full bleed, the letters inside the safe zone
//   icons/apple-touch-icon.png   180x180, full bleed (iOS rounds it itself)
//
//   node scripts/images/make-images.mjs                 render
//   node scripts/images/make-images.mjs --variants DIR  also og-{a,b,c}.png in DIR
//   node scripts/images/make-images.mjs --capture URL   re-capture shots/ from a
//       running arcade (npx vite in web/, with web/public/engine built) first
//
// Playwright comes from web/node_modules (npm ci in web/); ARCADE_CHROMIUM
// names another Chromium.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PUBLIC = path.join(ROOT, 'web/public');
const { chromium } = createRequire(path.join(ROOT, 'web/package.json'))('@playwright/test');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const browser = await chromium.launch(process.env.ARCADE_CHROMIUM ? { executablePath: process.env.ARCADE_CHROMIUM } : {});

try {
    // The screens on the card: each example's canvas a few seconds into a run.
    const capture = opt('--capture');
    if (capture) {
        for (const [ex, wait, keys] of [['ecs-circles', 4000, []], ['pong', 2500, [' ']],
                                        ['life', 5000, []], ['raygui-tuner', 3000, []]]) {
            const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
            await p.goto(`${capture}/?example=${ex}&run`);
            await p.locator('#console').getByText('Device initialized').waitFor({ timeout: 60_000 });
            const c = p.frameLocator('#screen-host iframe').locator('#canvas');
            for (const k of keys) { await c.click(); await p.keyboard.down(k); await p.waitForTimeout(150); await p.keyboard.up(k); }
            await p.waitForTimeout(wait);
            await c.screenshot({ path: path.join(HERE, 'shots', `shot-${ex}.png`) });
            await p.close();
        }
    }

    const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const render = async (v, out) => {
        await card.goto(`${pathToFileURL(path.join(HERE, 'og.html'))}?v=${v}`);
        await card.evaluate(() => document.fonts.ready);
        await card.waitForTimeout(200);
        await card.screenshot({ path: out });
    };
    await render('b', path.join(PUBLIC, 'og-image.png'));
    const variants = opt('--variants');
    if (variants) for (const v of ['a', 'b', 'c']) await render(v, path.join(variants, `og-${v}.png`));

    // The icons, from the badge's own SVG. Maskable and Apple touch icons are
    // full bleed: the platform cuts the shape, so the badge's rounded rect
    // and rim give way to its ground, and the letters shrink into the safe
    // zone (the centre 80% for maskable).
    const badge = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8');
    const fullBleed = (scale) => badge
        .replace(/<rect [^>]*\/>/, "<rect width='32' height='32' fill='#21200f'/>")
        .replace(/(<rect[^>]*\/>)([\s\S]*)<\/svg>/, `$1<g transform='translate(16 16) scale(${scale}) translate(-16 -16)'>$2</g></svg>`);
    fs.mkdirSync(path.join(PUBLIC, 'icons'), { recursive: true });
    for (const [file, size, svg, transparent] of [
        ['icon-192.png', 192, badge, true],
        ['icon-512.png', 512, badge, true],
        ['icon-maskable-512.png', 512, fullBleed(0.72), false],
        ['apple-touch-icon.png', 180, fullBleed(0.86), false],
    ]) {
        const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
        await p.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style>`
            + `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
        await p.waitForTimeout(100);
        await p.screenshot({ path: path.join(PUBLIC, 'icons', file), omitBackground: transparent });
        await p.close();
    }
    console.log('make-images: web/public/og-image.png and web/public/icons/');
} finally {
    await browser.close();
}
