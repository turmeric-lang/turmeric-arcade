// Vite configuration for Turmeric Arcade (play.turmeric-lang.com).
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { CONTENT_SECURITY_POLICY } from './csp.js';

const HERE = import.meta.dirname;

// The Cloudflare plugin builds the Worker as its own Vite environment, whose
// bundle closes before dist/client/ exists; a hook that works on dist/client/
// must skip that pass.
function isClientBuild(ctx) {
  return !ctx.environment || ctx.environment.name === 'client';
}

// Write the Content-Security-Policy (csp.js) into the built _headers.
// public/_headers is copied verbatim into dist/; the policy is stamped here
// rather than written by hand so there is one copy of it.  Loud on failure:
// a build that silently shipped without its CSP is a hardening everyone
// believes is in place.
function stampCsp() {
  return {
    name: 'stamp-csp',
    apply: 'build',
    closeBundle() {
      if (!isClientBuild(this)) return;
      const targets = [
        resolve(HERE, 'dist/client/_headers'),
        resolve(HERE, 'dist/_headers'),
      ].filter(existsSync);
      if (targets.length === 0) {
        throw new Error('_headers not found in dist/ -- the Content-Security-Policy '
                        + 'was NOT stamped; see web/csp.js');
      }
      for (const t of targets) {
        const lines = readFileSync(t, 'utf-8').split('\n')
          .filter((l) => !/^\s+Content-Security-Policy:/.test(l));
        const at = lines.findIndex((l) => l.trim() === '/*');
        if (at < 0) throw new Error(`${t} has no "/*" rule to carry the Content-Security-Policy`);
        lines.splice(at + 1, 0, `  Content-Security-Policy: ${CONTENT_SECURITY_POLICY}`);
        writeFileSync(t, lines.join('\n'));
      }
    },
  };
}

// Installable, and playable offline once played (raylib-web-playground-plan
// P5), as the C playground does it (turmeric-lang/c2mp vite-wasm):
//
// - 'prompt', not 'autoUpdate': a new version never reloads the page under
//   the visitor; main.js says one is ready in the status bar.
// - The shell (both pages, their scripts, styles, fonts, icons) is precached:
//   ~7.5 MB, what a visit downloads anyway, since the whole monaco-editor
//   package is imported and its language chunks load with it. Monaco's
//   TypeScript worker (6.9 MB) is the one chunk a visit never fetches -- the
//   arcade opens no TypeScript -- so it is left out.
//   The engine is not: web/public/engine is ~12 MB (the module, the stdlib
//   package, the spices, the language server), which a first visit should not
//   pay for before the page works. It is cached as it is used, network first:
//   its files are not content-hashed, so a cache-first copy could pair a new
//   turmeric-jit.js with an old turmeric-jit.wasm; offline, the cache answers.
// - Responses keep the headers they were fetched with, so the page and the
//   screen iframe stay cross-origin isolated (COOP/COEP) when the service
//   worker serves them, which the engine's threads need.
// - Registered by main.js (virtual:pwa-register), not an inline script: the
//   Content-Security-Policy allows none.
function pwa() {
  return VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    includeAssets: ['icons/apple-touch-icon.png', 'favicon.svg', 'og-image.png'],
    workbox: {
      globPatterns: ['**/*.{html,css,js,woff2,svg}'],
      globIgnores: ['engine/**', 'assets/ts.worker-*'],
      // editor.api (Monaco's core) is 2.7 MB, over the default 2 MB limit.
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/engine\//, /^\/screen\.html/],
      cleanupOutdatedCaches: true,
      runtimeCaching: [{
        urlPattern: ({ url }) => url.pathname.startsWith('/engine/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'arcade-engine',
          networkTimeoutSeconds: 8,
          expiration: { maxEntries: 40 },
        },
      }],
    },
    manifest: {
      name: 'Turmeric Arcade',
      short_name: 'Arcade',
      description: 'raylib, compiled in your browser: write a game in Turmeric and press Run.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#15141a',
      theme_color: '#15141a',
      categories: ['developer', 'education', 'games'],
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
  });
}

// The headers the dev and preview servers send on every response.  Production
// gets the same set from _headers (static assets) and worker.js (the rest).
const SERVER_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
};

export default defineConfig({
  base: '/',
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            main: resolve(HERE, 'index.html'),
            screen: resolve(HERE, 'screen.html'),
          },
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    // Not 3000: that is Try Turmeric's dev server on a developer's machine.
    port: 3100,
    headers: SERVER_HEADERS,
    // examples.js reads ../examples/ (the repository's examples tree).
    fs: { allow: [resolve(HERE, '..')] },
  },
  preview: {
    headers: SERVER_HEADERS,
  },
  plugins: [stampCsp(), cloudflare(), pwa()],
});
