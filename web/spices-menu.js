// spices-menu.js -- the Spices menu (raylib-web-playground-plan 5.3): one
// checkbox per spice the engine offers (engine/spices/index.json), with its
// one-line description.  Ticking one adds it to the program's defscript
// header, unticking removes it (defscript.js); the boxes follow the header
// as the program is edited, because the buffer is the source of truth.  The
// header pins each spice to the turmeric-spices commit the engine's packages
// were built from (engine.json), so the program copied out of the page
// fetches the same sources natively.

import { headerSpices, setHeaderSpices } from './defscript.js';

const ENGINE = '/engine';

export async function initSpicesMenu(editor, listEl) {
    let spices = [];
    let ref = 'main';
    try {
        const [idx, eng] = await Promise.all([
            fetch(`${ENGINE}/spices/index.json`).then((r) => (r.ok ? r.json() : { spices: [] })),
            fetch(`${ENGINE}/engine.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
        ]);
        spices = idx.spices || [];
        if (eng.spices && /^[0-9a-f]{40}$/.test(eng.spices)) ref = eng.spices;
    } catch (_) { /* no engine: an empty menu */ }
    const offered = spices.map((s) => s.name);

    listEl.replaceChildren();
    if (!spices.length) {
        const none = document.createElement('p');
        none.className = 'spices-none';
        none.textContent = 'This engine offers no spices.';
        listEl.appendChild(none);
    }
    const boxes = new Map();
    for (const s of spices) {
        const label = document.createElement('label');
        label.className = 'spice';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = s.name;
        box.addEventListener('change', () => {
            const names = offered.filter((n) => boxes.get(n).checked);
            const next = setHeaderSpices(editor.getValue(), names, offered, ref);
            if (next === null) {
                box.checked = !box.checked;
                label.title = 'The program\'s defscript header is not one this menu can edit';
                return;
            }
            editor.setValue(next);
        });
        const name = document.createElement('span');
        name.className = 'spice-name';
        name.textContent = `${s.name} ${s.version || ''}`.trim();
        const desc = document.createElement('span');
        desc.className = 'spice-desc';
        desc.textContent = s.description || '';
        label.append(box, name, desc);
        listEl.appendChild(label);
        boxes.set(s.name, box);
    }
    const sync = () => {
        const declared = new Set(headerSpices(editor.getValue()));
        for (const [n, box] of boxes) box.checked = declared.has(n);
    };
    editor.onChange(sync);
    sync();
    return { offered, ref, sync };
}
