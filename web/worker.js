import { CONTENT_SECURITY_POLICY } from './csp.js';

// The Worker in front of the static site: every response gets the headers
// that make the page cross-origin isolated (the engine is a pthreads build
// and needs SharedArrayBuffer) and the one Content-Security-Policy.
// `_headers` rules reach the static assets; this reaches everything else.
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
