// split.js -- draggable dividers between the panes (the C playground's
// split.js, turmeric-lang/c2mp, generalised to more than one): the editor |
// the screen and console, and the screen | the console below it.
//
// Each divider sets one fraction, a CSS custom property on its container
// (--split-h, --split-v), stored so the layout survives a reload. Drag it,
// or focus it and use the arrow keys (Home and End for the limits);
// double-click puts it back to its default. Below 800px the page is one
// scrolling column and the dividers are hidden (style.css), so nothing here
// runs there.

import { read as readStored, write as writeStored } from './storage.js';

const MIN = 0.15;
const MAX = 0.85;
const clamp = (n) => Math.min(MAX, Math.max(MIN, n));

// One divider. `axis` is 'x' (a vertical bar, dragged sideways) or 'y'.
export function initSplit(container, handle, { prop, key, axis, initial }) {
    const stored = Number(readStored(key));
    const apply = (f) => container.style.setProperty(prop, String(clamp(f)));
    const current = () => parseFloat(getComputedStyle(container).getPropertyValue(prop)) || initial;
    const persist = () => writeStored(key, String(current()));
    apply(Number.isFinite(stored) && stored > 0 ? stored : initial);

    handle.setAttribute('role', 'separator');
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('aria-orientation', axis === 'x' ? 'vertical' : 'horizontal');

    let pointerId = null;
    let rect = null;
    handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        pointerId = e.pointerId;
        rect = container.getBoundingClientRect();
        handle.setPointerCapture(pointerId);
        // The screen is an iframe: without this it would take the pointer
        // the moment the drag crossed it.
        document.body.classList.add('is-splitting');
        e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
        if (pointerId !== e.pointerId) return;
        const size = axis === 'x' ? rect.width : rect.height;
        if (size <= 0) return;
        apply((axis === 'x' ? e.clientX - rect.left : e.clientY - rect.top) / size);
        e.preventDefault();
    });
    const end = () => {
        if (pointerId === null) return;
        handle.releasePointerCapture(pointerId);
        pointerId = null;
        document.body.classList.remove('is-splitting');
        persist();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);

    handle.addEventListener('keydown', (e) => {
        const [dec, inc] = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
        let next;
        if (e.key === dec) next = current() - 0.02;
        else if (e.key === inc) next = current() + 0.02;
        else if (e.key === 'Home') next = MIN;
        else if (e.key === 'End') next = MAX;
        else return;
        e.preventDefault();
        apply(next);
        persist();
    });
    handle.addEventListener('dblclick', () => { apply(initial); persist(); });
}
