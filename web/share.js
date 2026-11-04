// share.js -- share links (raylib-web-playground-plan P2): the program in the
// URL as #code= (share-codec.js, Try Turmeric's format), kept up to date as
// it is edited, read back on load, and copied to the clipboard by Share.
// An example left as it is shares as ?example=NAME instead (P4): a short
// link, and one that follows the example if it changes.

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
// `pristine()` names the example the editor holds unedited, or null: the URL
// is then just its ?example= link, with no #code=.
export function followEditor(editor, pristine = () => null) {
    let timer = null;
    let seq = 0;
    editor.onChange(() => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            const mine = ++seq;
            const name = pristine();
            if (name) {
                window.history.replaceState(null, '', exampleUrl(name, false));
                return;
            }
            const payload = await encodeShareCode(editor.getValue());
            if (payload && mine === seq) {
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#code=${payload}`);
            }
        }, 300);
    });
}

// The deep link to an example (?example=NAME, and &run to run it on
// arrival); `absolute` gives the whole URL, else the path and query.
export function exampleUrl(name, absolute = true) {
    const q = `?example=${encodeURIComponent(name)}`;
    return absolute ? `${window.location.origin}${window.location.pathname}${q}` : `${window.location.pathname}${q}`;
}

// What a ?example= link asks for: {name, run}, or null.
export function linkedExample() {
    const p = new URLSearchParams(window.location.search);
    const name = p.get('example');
    return name ? { name, run: p.has('run') && p.get('run') !== '0' } : null;
}

// Share: the link to the current program, on the clipboard.  Returns the URL
// and whether it was copied; where the clipboard is refused, the caller shows
// the link instead.
export async function shareLink(editor, pristine = () => null) {
    const name = pristine();
    const payload = name ? null : await encodeShareCode(editor.getValue());
    if (!name && !payload) return { url: null, copied: false };
    const url = name ? exampleUrl(name) : urlFor(payload);
    try {
        await navigator.clipboard.writeText(url);
        return { url, copied: true };
    } catch (_) {
        return { url, copied: false };
    }
}
