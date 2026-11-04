// check-pwa.mjs -- what the built service worker precaches, and the manifest
// (raylib-web-playground-plan P5; vite.config.js pwa()). Run after
// `npm run build` in web/ (CI does):
//
//   node scripts/check-pwa.mjs
//
// The precache must hold both pages and Monaco's core, and must NOT hold the
// engine (cached as it is used, network first) or Monaco's TypeScript worker
// (never fetched); the manifest must name the app and carry the icons.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/dist/client');
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failed++; };

const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
check(urls.includes('index.html') && urls.includes('screen.html'), 'both pages are precached');
check(urls.some((u) => /^assets\/editor\.api-/.test(u)), "Monaco's core is precached");
check(urls.some((u) => /^assets\/iosevka-400-/.test(u)), 'the font is precached');
check(!urls.some((u) => u.startsWith('engine/')), 'the engine is not precached');
check(!urls.some((u) => /ts\.worker/.test(u)), "Monaco's TypeScript worker is not precached");
check(/arcade-engine/.test(sw) && /NetworkFirst/.test(sw), 'the engine is cached at run time, network first');

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
check(/<link rel="manifest" href="\/manifest\.webmanifest">/.test(html), 'index.html links the manifest');
check(/property="og:image" content="https:\/\/play\.turmeric-lang\.com\/og-image\.png"/.test(html), 'index.html carries og:image');

const m = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8'));
check(m.name === 'Turmeric Arcade' && m.display === 'standalone', 'the manifest names the app, standalone');
for (const i of m.icons) check(fs.existsSync(path.join(DIST, i.src)), `icon ${i.src} (${i.purpose}) is built`);
check(fs.existsSync(path.join(DIST, 'og-image.png')), 'og-image.png is built');

process.exit(failed ? 1 : 0);
