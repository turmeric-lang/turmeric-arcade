// editor.js -- the program editor: Monaco with the Turmeric language
// (editor-language.js), over the textarea index.html starts with.  The page
// talks to it through five calls -- getValue, setValue, focus, onRun, onChange -- so
// that if Monaco fails to load, the textarea is still the editor and nothing
// else changes.  The import is the whole of monaco-editor, as Try's is, but
// the only worker handed out is Monaco's own editor worker: the language
// intelligence is the language server's (P2), and the JSON/CSS/TS workers
// start only for those languages, which the arcade never opens.

import { configureTurmeric } from './editor-language.js';

// The page's theme (public/theme.js: light or dark, the OS's until the
// visitor picks), over Monaco's vs / vs-dark, in the page's colours
// (style.css).  Monaco takes colours as a JS object, so the theme is rebuilt
// from the stylesheet on each tur-themechange.
const pageTheme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
function defineTheme(monaco) {
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);
    const name = `arcade-${pageTheme()}`;
    monaco.editor.defineTheme(name, {
        base: pageTheme() === 'light' ? 'vs' : 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
            'editor.background': v('--bg', '#15141a'),
            'editor.foreground': v('--fg', '#e8e6ef'),
            'editorLineNumber.foreground': v('--dim', '#9a97a8'),
            'editorCursor.foreground': v('--accent', '#e6a23c'),
        },
    });
    return name;
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

export async function createEditor(textarea) {
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
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        bracketPairColorization: { enabled: true },
    });
    return {
        kind: 'monaco',
        monaco,
        editor,
        getValue: () => editor.getValue(),
        setValue: (s) => editor.setValue(s),
        focus: () => editor.focus(),
        onRun: (fn) => editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, fn),
        onChange: (fn) => editor.onDidChangeModelContent(() => fn()),
    };
}
