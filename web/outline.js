// outline.js -- the Symbols panel (raylib-web-playground-plan, editor phase
// item 2): what the program defines, in file order, each a click away; Try
// Turmeric's outline (its web/outline.js) and the C playground's Symbols menu.
//
// The language server has answered documentSymbol since P2, and Ctrl/Cmd+
// Shift+O opens Monaco's filterable list of it, but nothing on the page said
// so.  This is a list to look at without typing, and its last row names the
// shortcut.  Filled each time it opens, never kept in step: the program
// changes on every keystroke and the list is read once in a while.

// What to call each kind out loud (Try's labels, after the C playground's):
// what you would say about the entry, not the LSP enum's name.
const KIND_LABELS = {
    Function: 'function', Method: 'function', Constructor: 'constructor',
    Variable: 'value', Constant: 'constant',
    Struct: 'type', Class: 'type', Enum: 'type', Interface: 'class',
    Object: 'instance', Operator: 'macro', Module: 'module', Namespace: 'module',
    Field: 'field', Property: 'field', EnumMember: 'variant', TypeParameter: 'type param',
};
const kindLabel = (k) => KIND_LABELS[k] || String(k || '').toLowerCase();

// The entry the caret is in (Try's rule, from the C playground): on a name,
// that one; otherwise the smallest range around it, so editing the middle of
// a function still marks the function.
function currentIndex(symbols, pos) {
    if (!pos) return -1;
    const within = (r) => !(pos.lineNumber < r.startLineNumber || pos.lineNumber > r.endLineNumber ||
        (pos.lineNumber === r.startLineNumber && pos.column < r.startColumn) ||
        (pos.lineNumber === r.endLineNumber && pos.column > r.endColumn));
    const onName = symbols.findIndex((s) => within(s.selectionRange || s.range));
    if (onName >= 0) return onName;
    let best = -1, bestSpan = Infinity;
    symbols.forEach((s, i) => {
        const r = s.range;
        const span = (r.endLineNumber - r.startLineNumber) * 100000 + (r.endColumn - r.startColumn);
        if (within(r) && span < bestSpan) { best = i; bestSpan = span; }
    });
    return best;
}

/**
 * The panel is a <details> (as Spices is), so the phone's menu shows it in
 * place.  `getLsp` starts the language server if it is not up (it starts on
 * the editor's first focus otherwise) and resolves to the client, or null.
 * `onJump` runs after a row is picked (the page closes its phone menu).
 */
export function initOutline({ monaco, editor, details, list, getLsp, onJump }) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    let symbols = [];
    let state = 'loading';

    const message = (text) => {
        const p = document.createElement('p');
        p.className = 'symbols-empty';
        p.textContent = text;
        return p;
    };
    const jump = (sym) => {
        const r = sym.selectionRange || sym.range;
        try {
            editor.revealRangeInCenterIfOutsideViewport(r);
            editor.setPosition({ lineNumber: r.startLineNumber, column: r.startColumn });
            editor.focus();
        } catch (_) { /* the program was replaced under the list */ }
    };
    const close = () => { details.open = false; };

    function render() {
        const rows = [];
        if (state !== 'ok') {
            // Three sentences on purpose: an empty list because analysis is
            // down is not "this program defines nothing".
            rows.push(message(state === 'loading' ? 'Reading symbols...' :
                              state === 'unavailable' ? 'Analysis is unavailable.' :
                                                        'Nothing defined yet.'));
        } else {
            const cur = currentIndex(symbols, editor.getPosition());
            symbols.forEach((sym, i) => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'symbol-item';
                if (i === cur) row.setAttribute('aria-current', 'true');
                const name = document.createElement('span');
                name.className = 'symbol-name';
                name.textContent = sym.name;
                const kind = document.createElement('span');
                kind.className = 'symbol-kind';
                kind.textContent = kindLabel(sym.kindName);
                row.append(name, kind);
                row.addEventListener('click', () => { close(); jump(sym); if (onJump) onJump(); });
                rows.push(row);
            });
        }
        // Monaco's own filterable list, with the key that opens it.  Gone
        // rather than dead if a Monaco without the action is ever loaded.
        const action = editor.getAction('editor.action.quickOutline');
        if (action) {
            const filter = document.createElement('button');
            filter.type = 'button';
            filter.className = 'symbol-filter';
            filter.innerHTML = `<span>Filter...</span><span class="kbd-hint"><kbd>${isMac ? '<svg class="icon"><use href="#i-command"/></svg>' : 'Ctrl'}</kbd><kbd>Shift</kbd><kbd>O</kbd></span>`;
            filter.addEventListener('click', async () => {
                close();
                if (onJump) onJump();
                // Monaco enables the action only once a symbol provider is
                // registered, which the language server's start does: a click
                // before the server is up waits for it rather than doing
                // nothing.
                try { await getLsp(); } catch (_) { /* the list just comes up empty */ }
                editor.focus();
                action.run();
            });
            rows.push(filter);
        }
        list.replaceChildren(...rows);
    }

    async function fill() {
        state = 'loading';
        render();
        let lsp = null;
        try { lsp = await getLsp(); } catch (_) { lsp = null; }
        if (!lsp || !lsp.isAvailable()) { state = 'unavailable'; render(); return; }
        try {
            symbols = (await lsp.documentSymbols(editor.getModel())) || [];
        } catch (_) { state = 'unavailable'; render(); return; }
        if (!details.open) return;   // closed while the server answered
        // File order: an outline out of step with the file is harder to use
        // than none.
        symbols.sort((a, b) => (a.range.startLineNumber - b.range.startLineNumber) ||
                               (a.range.startColumn - b.range.startColumn));
        state = symbols.length ? 'ok' : 'empty';
        render();
    }

    details.addEventListener('toggle', () => { if (details.open) fill(); });
    // Closed by a click elsewhere or Escape, as a menu is.
    document.addEventListener('click', (e) => { if (details.open && !details.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && details.open) close(); });

    // Test surface: the rows as drawn, and the state behind an empty list.
    return {
        rows: () => [...list.querySelectorAll('.symbol-item')].map((el) => ({
            name: el.querySelector('.symbol-name').textContent,
            kind: el.querySelector('.symbol-kind').textContent,
            current: el.getAttribute('aria-current') === 'true',
        })),
        state: () => state,
    };
}
