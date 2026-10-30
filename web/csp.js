// csp.js -- the Content-Security-Policy for everything play.turmeric-lang.com
// serves.  One source, three places it is applied, as on turmeric-lang.com
// (turmeric's web/csp.js): vite.config.js sends it from the dev and preview
// servers and stamps it into the built _headers (what Cloudflare attaches to
// every static asset), and worker.js sets it on every response the Worker
// itself produces.
//
//   'wasm-unsafe-eval'   The engine is WebAssembly, compiled in the screen
//                        pane's iframe.  Nothing here needs JavaScript eval.
//   frame-src 'self'     The screen pane is a same-origin iframe (screen.html).
//   frame-ancestors 'self'
//                        screen.html is framed by the page; nothing off this
//                        origin may frame either.
//   style 'unsafe-inline' Styles only; script-src has no 'unsafe-inline'.
export const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
].join('; ');
