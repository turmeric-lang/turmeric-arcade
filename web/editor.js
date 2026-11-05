// editor.js -- the program editor: Monaco with the Turmeric language
// (editor-language.js), over the textarea index.html starts with.  The page
// talks to it through five calls -- getValue, setValue, focus, onRun, onChange -- so
// that if Monaco fails to load, the textarea is still the editor and nothing
// else changes.  The import is the whole of monaco-editor, as Try's is, but
// the only worker handed out is Monaco's own editor worker: the language
// intelligence is the language server's (P2), and the JSON/CSS/TS workers
// start only for those languages, which the arcade never opens.

import { configureTurmeric } from './editor-language.js';
import { MINIMAP_OPTIONS } from './minimap.js';
// The Turmeric token colours, written down once in turmeric's
// web/editor-palette.json -- Try Turmeric's Monaco themes and the VS Code,
// Vim and Emacs packs all carry them -- and copied here verbatim.  Update by
// copying the file again, never by editing the colours in this one.
import PALETTE from './editor-palette.json';

// The token rules Try Turmeric's editor-theme.js builds from the palette:
// the same Monarch token names (editor-language.js), the same colours.
function tokenRules(p) {
    return [
        { token: 'comment',          foreground: p.comment, fontStyle: 'italic' },
        { token: 'string',           foreground: p.string },
        { token: 'number',           foreground: p.number },
        { token: 'number.float',     foreground: p.number },
        { token: 'keyword',          foreground: p.keyword, fontStyle: 'bold' },
        { token: 'keyword.operator', foreground: p.keywordOperator },
        { token: 'annotation',       foreground: p.annotation },
        { token: 'kind',             foreground: p.kind },
        { token: 'type',             foreground: p.type },
        { token: 'operator',         foreground: p.operator },
        { token: 'delimiter',        foreground: p.delimiter },
        { token: 'identifier',       foreground: p.foreground },
    ];
}

// Rainbow brackets, Try Turmeric's two sets (editor-theme.js
// RAINBOW_BRACKETS, after trowel's turmeric-dark): six depths and an
// unmatched-bracket red; the light set is darkened to read on the light page.
const RAINBOW = {
    dark:  ['#EFA030', '#D7C94A', '#A8C98A', '#7AC4B8', '#8AB0E8', '#C4A0E8', '#FF5C57'],
    light: ['#B5650A', '#8A7800', '#4E7F24', '#13756A', '#2F62B0', '#7748AE', '#D0312D'],
};
function bracketColors(set) {
    const c = {};
    set.slice(0, 6).forEach((hex, i) => { c[`editorBracketHighlight.foreground${i + 1}`] = hex; });
    c['editorBracketHighlight.unexpectedBracket.foreground'] = set[6];
    return c;
}

// The page's theme (public/theme.js: light or dark, the OS's until the
// visitor picks): Turmeric's token colours and brackets on the page's own
// canvas (style.css), so the editor sits in the page rather than as a panel
// of another colour.  Monaco takes colours as a JS object, so the theme is
// rebuilt from the stylesheet on each tur-themechange.  Monaco reads a colour
// it cannot parse as opaque red, so only literal hex is taken from CSS.
const pageTheme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
function defineTheme(monaco) {
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => {
        const raw = css.getPropertyValue(name).trim();
        return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw) ? raw : fallback;
    };
    const theme = pageTheme();
    const name = `arcade-${theme}`;
    monaco.editor.defineTheme(name, {
        base: theme === 'light' ? 'vs' : 'vs-dark',
        inherit: true,
        rules: tokenRules(PALETTE[theme]),
        colors: {
            'editor.background': v('--bg', '#15141a'),
            'editor.foreground': `#${PALETTE[theme].foreground}`,
            'editorLineNumber.foreground': v('--dim', '#9a97a8'),
            'editorCursor.foreground': v('--accent', '#e6a23c'),
            ...bracketColors(RAINBOW[theme]),
            ...minimapColors(v, theme),
            ...indentGuideColors(v, theme),
        },
    });
    return name;
}

// The minimap's colours, after Try's minimapColors: the strip is part of the
// editor's canvas, its slider is the page's dim grey, and its marks wash over
// the shape of the file rather than hide it -- except errors, which are why
// you look at it.  (#RRGGBB plus an alpha byte: Monaco takes no rgba().)
function minimapColors(v, theme) {
    const bg = v('--bg', theme === 'light' ? '#fbf8f2' : '#15141a');
    const dim = v('--dim', theme === 'light' ? '#6b6458' : '#9a97a8');
    const accent = v('--accent', theme === 'light' ? '#a8650f' : '#e6a23c');
    const err = v('--err', theme === 'light' ? '#c62828' : '#ff7b72');
    const a = (hex, alpha) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex) + alpha;
    return {
        'minimap.background': bg,
        'minimapSlider.background': a(dim, '33'),
        'minimapSlider.hoverBackground': a(dim, '4D'),
        'minimapSlider.activeBackground': a(dim, '73'),
        'minimap.errorHighlight': err,
        'minimap.warningHighlight': accent,
        'minimap.findMatchHighlight': a(accent, '99'),
        'minimap.selectionHighlight': a(dim, '80'),
        'minimap.selectionOccurrenceHighlight': a(dim, '66'),
    };
}

// The indent guides, as faint as Try Turmeric's: Try lifts them off its
// canvas by a tenth of the way to the text (dark #222018 on #0C0A08) and the
// active one by about a quarter (#3D3A2F); Monaco's stock #404040 is three
// times as loud on this page.  Taken as the same fractions of the page's own
// --bg to --fg, so they follow the palette; on the light page, whose canvas
// is Try's, they come out as light as Try's #E3D9C8 and #C0B099.
const GUIDE_MIX = { dark: [0.10, 0.22], light: [0.11, 0.27] };
function indentGuideColors(v, theme) {
    const rgb = (hex) => {
        const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1, 7);
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    };
    const bg = rgb(v('--bg', theme === 'light' ? '#fbf8f2' : '#15141a'));
    const fg = rgb(v('--fg', theme === 'light' ? '#24201a' : '#e8e6ef'));
    const mix = (t) => '#' + bg.map((b, i) => Math.round(b + (fg[i] - b) * t).toString(16).padStart(2, '0')).join('');
    const [quiet, active] = GUIDE_MIX[theme];
    return {
        'editorIndentGuide.background1': mix(quiet),
        'editorIndentGuide.activeBackground1': mix(active),
    };
}

function textareaEditor(textarea) {
    return {
        kind: 'textarea',
        getValue: () => textarea.value,
        setValue: (s) => { textarea.value = s; },
        focus: () => textarea.focus(),
        onRun: (fn) => textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); fn(); }
        }),
        onChange: (fn) => textarea.addEventListener('input', () => fn()),
    };
}

// index.html starts the pane in data-editor="loading" (a spinner, the
// textarea hidden); this ends it, whichever editor the page ends up with.
function ready() {
    const pane = document.getElementById('editor-pane');
    if (pane) pane.dataset.editor = 'ready';
}

export async function createEditor(textarea) {
    try { return await createEditorIn(textarea); } finally { ready(); }
}

async function createEditorIn(textarea) {
    const fallback = textareaEditor(textarea);
    let monaco;
    try {
        self.MonacoEnvironment = {
            getWorker: () => new Worker(new URL('monaco-editor/editor/editor.worker.js', import.meta.url),
                                        { type: 'module' }),
        };
        monaco = await import('monaco-editor');
    } catch (err) {
        console.warn('Monaco did not load; the editor stays a textarea:', err);
        return fallback;
    }
    // Lay out in Iosevka from the start, if it comes in time: Monaco measures
    // the font once, when it is created (remeasured below if it is late).
    if (document.fonts && document.fonts.load) {
        await Promise.race([document.fonts.load("13px 'Iosevka'"),
                            new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
    }
    configureTurmeric(monaco);
    const theme = defineTheme(monaco);
    document.addEventListener('tur-themechange', () => monaco.editor.setTheme(defineTheme(monaco)));
    const host = document.createElement('div');
    host.id = 'monaco';
    host.className = 'monaco-host';
    textarea.replaceWith(host);
    const editor = monaco.editor.create(host, {
        value: textarea.value,
        language: 'turmeric',
        theme,
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        detectIndentation: false,
        // Try Turmeric's editor options (its main.js), less the tabs and REPL
        // it serves.  The minimap is switched on by minimap.js, which
        // measures the editor first.
        minimap: MINIMAP_OPTIONS,
        wordWrap: 'on',
        folding: true,
        showFoldingControls: 'mouseover',
        lineDecorationsWidth: 10,
        autoClosingBrackets: 'beforeWhitespace',
        autoClosingQuotes: 'beforeWhitespace',
        autoSurround: 'never',
        guides: { bracketPairs: true, bracketPairsHorizontal: 'active', highlightActiveBracketPair: true },
        find: { seedSearchStringFromSelection: 'always' },
        occurrencesHighlight: 'singleFile',
        selectionHighlight: true,
        // Three lanes put the language server's errors and warnings as ticks
        // in the right-hand strip, findable without scrolling.
        overviewRulerLanes: 3,
        overviewRulerBorder: false,
        quickSuggestions: { other: true, comments: false, strings: false },
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        smoothScrolling: true,
        multiCursorModifier: 'ctrlCmd',
        fontSize: 13,
        // The page's face (style.css's @font-face): Iosevka, with its
        // ligatures (-> => <= ...), which the subset keeps (calt).
        fontFamily: "'Iosevka', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
        fontLigatures: true,
        scrollBeyondLastLine: false,
        bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false },
    });
    // F12: go to definition (the language server's). Cmd/Ctrl+click already
    // does it; Monaco on its own does not bind the key people reach for.
    editor.addCommand(monaco.KeyCode.F12, () => {
        try { editor.getAction('editor.action.revealDefinition')?.run(); } catch (_) { /* no provider yet */ }
    });
    // Monaco measures the font when it is created; if Iosevka arrives after
    // that (font-display: swap), the cursor and selections would be placed
    // with the fallback's widths until something remeasures.
    if (document.fonts && document.fonts.load) {
        document.fonts.load("13px 'Iosevka'").then(() => monaco.editor.remeasureFonts(), () => {});
    }
    return {
        kind: 'monaco',
        monaco,
        editor,
        host,
        getValue: () => editor.getValue(),
        setValue: (s) => editor.setValue(s),
        focus: () => editor.focus(),
        onRun: (fn) => editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, fn),
        onChange: (fn) => editor.onDidChangeModelContent(() => fn()),
    };
}
