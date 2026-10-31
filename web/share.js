// share.js -- share links (raylib-web-playground-plan P2): the program in the
// URL as #code= (share-codec.js, Try Turmeric's format), kept up to date as
// it is edited, read back on load, and copied to the clipboard by Share.

import { encodeShareCode, decodeShareCode } from './share-codec.js';

function hashCode() {
    const m = /(?:^#|&)code=([^&]*)/.exec(window.location.hash);
    return m ? m[1] : null;
}

function urlFor(payload) {
    return `${window.location.origin}${window.location.pathname}#code=${payload}`;
}

// The program a #code= link carries, or null when there is none (or it does
// not decode: the page then opens on its default program).
export async function sharedProgram() {
    const payload = hashCode();
    if (!payload) return null;
    const code = await decodeShareCode(payload);
    return code || null;
}

// Keep #code= in step with the editor, debounced; replaceState, so editing
// does not stack history entries.  Encoding is async: an older, slower encode
// never lands after a newer one.
export function followEditor(editor) {
    let timer = null;
    let seq = 0;
    editor.onChange(() => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            const mine = ++seq;
            const payload = await encodeShareCode(editor.getValue());
            if (payload && mine === seq) {
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#code=${payload}`);
            }
        }, 300);
    });
}

// Share: the link to the current program, on the clipboard.  Returns the URL
// and whether it was copied; where the clipboard is refused, the caller shows
// the link instead.
export async function shareLink(editor) {
    const payload = await encodeShareCode(editor.getValue());
    if (!payload) return { url: null, copied: false };
    const url = urlFor(payload);
    try {
        await navigator.clipboard.writeText(url);
        return { url, copied: true };
    } catch (_) {
        return { url, copied: false };
    }
}
