// Vite configuration for Turmeric Arcade (play.turmeric-lang.com).
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
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
  },
  preview: {
    headers: SERVER_HEADERS,
  },
  plugins: [stampCsp(), cloudflare()],
});
