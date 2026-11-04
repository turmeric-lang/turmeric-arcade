// storage.js -- localStorage that cannot take the page down with it (the C
// playground's, turmeric-lang/c2mp vite-wasm/src/storage.js).
//
// Reading window.localStorage *throws* rather than returning null when a
// browser has site data blocked -- Chrome's "block all cookies", a sandboxed
// iframe, some enterprise policies. Because the editor's restore runs at module
// scope, an unguarded read aborts module evaluation and the page never boots at
// all: no interpreter, no console, Run disabled forever. Everything here
// degrades to a no-op instead, so blocked storage costs you persistence and
// nothing else.

function probe() {
  try {
    const ls = window.localStorage;
    // Safari's old private mode exposed the object but threw on write, so
    // prove a round trip rather than trusting that the property exists.
    const key = '__arcade_probe__';
    ls.setItem(key, '1');
    ls.removeItem(key);
    return ls;
  } catch {
    return null;
  }
}

const backing = probe();

/** False when the browser refuses us storage; nothing will be persisted. */
export const storageAvailable = backing !== null;

export function read(key) {
  if (!backing) return null;
  try {
    return backing.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false if the write was refused -- almost always a quota error. */
export function write(key, value) {
  if (!backing) return false;
  try {
    backing.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
