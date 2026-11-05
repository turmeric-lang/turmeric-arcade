// minimap.js -- the editor's minimap (raylib-web-playground-plan, editor
// phase item 1): Monaco's own, configured as Try Turmeric configures it
// (turmeric's web/main.js and web/minimap.js).
//
// Two things decide whether it shows: the visitor's choice, once they have
// made one with the toolbar's Minimap button, and otherwise the editor's
// measured width.  The width, not a media query, because the divider can make
// the editor 300 px wide on a wide screen, and a minimap there is a fifth of
// the code column showing three characters of shape.  On a phone (600 px and
// under) it never shows and the button is not offered: the strip would take
// a sixth of a column that is already narrow.

import { read as readStored, write as writeStored } from './storage.js';

// About 80 columns of Iosevka at 13 px and the gutter: under this the code no
// longer fits comfortably beside the strip.  Try's figure.
const MIN_WIDTH = 600;
const KEY = 'arcade.minimap';
const PHONE = '(max-width: 600px)';

// The options Try starts with: blocks rather than characters (no browser
// hints glyphs at 2 px, so drawn characters are mush), the slider only on
// hover, and the strip scaled to the file rather than the pane.  Off until
// the width is known: on-then-off on the first layout flickers.
export const MINIMAP_OPTIONS = {
    enabled: false,
    renderCharacters: false,
    showSlider: 'mouseover',
    size: 'proportional',
    maxColumn: 80,
};

/** The visitor's choice, or null when they have not made one. */
function preference() {
    const v = readStored(KEY);
    return v === 'on' ? true : v === 'off' ? false : null;
}

export function initMinimap({ monaco, editor, host, button }) {
    const enabled = () => {
        try { return !!editor.getOption(monaco.editor.EditorOption.minimap).enabled; } catch (_) { return false; }
    };
    const wanted = () => {
        if (window.matchMedia(PHONE).matches) return false;
        const pref = preference();
        if (pref !== null) return pref;
        // A layout that has not happened yet measures 0: the next one
        // decides, and the strip starts off rather than flickering.
        let width = 0;
        try { width = editor.getLayoutInfo().width; } catch (_) { return false; }
        return width >= MIN_WIDTH;
    };
    const sync = () => {
        if (!button) return;
        const on = enabled();
        button.setAttribute('aria-pressed', String(on));
        button.title = on ? 'Hide the minimap' : 'Show the minimap';
    };
    // The minimap is ours to switch, and a throw here must not take the
    // editor with it: the editor without a minimap is still the editor.
    const apply = () => {
        try {
            const on = wanted();
            if (on !== enabled()) editor.updateOptions({ minimap: { enabled: on } });
        } catch (err) {
            console.warn('arcade: could not switch the minimap', err);
        }
        sync();
    };
    // Anything that changes the editor's width: the window, the divider, the
    // phone's Code/Run views, a rotated tablet.
    if (typeof ResizeObserver !== 'undefined' && host) new ResizeObserver(apply).observe(host);
    window.addEventListener('resize', apply);
    if (button) {
        button.hidden = false;
        button.addEventListener('click', () => {
            writeStored(KEY, enabled() ? 'off' : 'on');
            apply();
        });
    }
    apply();
    return { enabled, preference, apply };
}
