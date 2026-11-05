// main.js -- the arcade page: an editor, a Run and a Stop, the screen pane and
// the console.  Run puts the program in a fresh iframe (screen.html), whose
// shell boots the engine and runs it; the console shows what it prints and
// the engine line when main returns.  Stop removes the iframe.  The contract
// between the two is at the top of screen.js.

import { EXAMPLES } from './examples.js';
import { createEditor } from './editor.js';
import { initMinimap } from './minimap.js';
import { createLspClient } from './lsp-client.js';
import { initSpicesMenu } from './spices-menu.js';
import { sharedProgram, followEditor, shareLink, linkedExample, exampleUrl } from './share.js';
import { read as readStored, write as writeStored } from './storage.js';
import { initSplit } from './split.js';
import { registerSW } from 'virtual:pwa-register';

// The textarea until Monaco has loaded (editor.js), then Monaco.
let editor = null;
let minimap = null;   // minimap.js, with Monaco
const textarea = document.getElementById('editor');
const runBtn = document.getElementById('run-btn');
const runAgain = document.getElementById('run-again');   // " again", on a wide screen
const stopBtn = document.getElementById('stop-btn');
const examples = document.getElementById('examples');
const status = document.getElementById('status');
const screenHost = document.getElementById('screen-host');
const consoleEl = document.getElementById('console');
const fpsEl = document.getElementById('fps');
let lastFps = null;     // the last 'fps' message (tests read it)
function showFps(m) {
    lastFps = m;
    fpsEl.hidden = !m;
    fpsEl.textContent = m ? `${m.fps} fps` : '';
}

let frame = null;       // the current run's iframe, or null
let pending = null;     // the program the next 'screen-ready' runs
let lastBoot = null;    // the last run's 'boot' message (tests read it)

// The phone's two views (index.html's tabs; style.css shows one at a time
// below 800px, and both, with the tabs hidden, above it).
const tabDot = document.querySelector('#tab-run .tab-dot');
function setView(view) {
    document.body.dataset.view = view;
    for (const t of document.querySelectorAll('.view-tabs [role="tab"]')) {
        t.setAttribute('aria-selected', String(t.dataset.view === view));
    }
    if (view === 'run') tabDot.hidden = true;
}
for (const t of document.querySelectorAll('.view-tabs [role="tab"]')) {
    t.addEventListener('click', () => setView(t.dataset.view));
}

function appendLine(text, cls) {
    if (document.body.dataset.view !== 'run') tabDot.hidden = false;
    const line = document.createElement('div');
    line.className = 'line' + (cls ? ' ' + cls : '');
    line.textContent = text;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

const ms = (n) => `${Math.round(n)} ms`;
function engineLine(a) {
    if (a.engine === 'error') return `Error: ${a.reason || 'the program failed'}`;
    if (a.engine === 'refused') return `Error: this engine cannot run the program: ${a.reason || 'refused'}`;
    if (a.engine === 'interpreted') return `interpreted -- ${a.reason || ''}`.trim();
    if (a.mainLoop) return 'compiled -- main loop running';
    const exit = a.exit ? ` (exit ${a.exit})` : '';
    return `compiled${exit} -- front ${ms(a.front_ms || 0)}, c2mir ${ms(a.compile_ms || 0)}, run ${ms(a.run_ms || 0)}`;
}

function setRunning(on) {
    runAgain.hidden = !on;
    stopBtn.disabled = !on;
    document.body.dataset.run = on ? 'running' : 'idle';
}

function stop(quiet) {
    if (!frame) return;
    frame.remove();
    frame = null;
    pending = null;
    if (!quiet) appendLine('-- stopped', 'engine');
    status.textContent = 'ready';
    showFps(null);
    setRunning(false);
}

// The engine is a JSPI build (raylib-web-playground-plan J4): in a browser
// without JSPI it cannot even load, so Run is off and the banner says why,
// while the editor, examples, Spices menu and sharing still work.
const HAS_JSPI = typeof WebAssembly === 'object' && 'Suspending' in WebAssembly;
const NO_JSPI_REASON = 'This browser has no JSPI (JavaScript Promise Integration), which the engine needs: '
    + 'Chrome or Edge 137 or later has it.';
if (!HAS_JSPI) {
    document.getElementById('no-jspi').hidden = false;
    runBtn.disabled = true;
    runBtn.title = NO_JSPI_REASON;
}

function run(src) {
    if (src !== undefined && editor) editor.setValue(src);
    setView('run');   // on a phone, show what Run does (or why it cannot)
    if (!HAS_JSPI) {
        appendLine(`Error: ${NO_JSPI_REASON}`, 'err');
        return;
    }
    stop(true);
    lastBoot = null;
    showFps(null);
    pending = { src: editor.getValue(), args: '' };
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    f.title = 'screen';
    f.src = '/screen.html';
    screenHost.replaceChildren(f);
    frame = f;
    status.textContent = 'starting the engine...';
    setRunning(true);
}

window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !frame || e.source !== frame.contentWindow) return;
    const m = e.data;
    if (!m) return;
    switch (m.type) {
        case 'screen-ready':
            if (pending) frame.contentWindow.postMessage({ type: 'run', ...pending }, location.origin);
            pending = null;
            break;
        case 'boot':
            lastBoot = m;
            if (m.ok) {
                const spices = m.spices && m.spices.length ? `, spices: ${m.spices.join(', ')}` : '';
                status.textContent = `engine up in ${ms(m.ms)}${spices}`;
            } else {
                status.textContent = '';
                appendLine(`Error: the engine did not start: ${m.error}`, 'err');
                setRunning(false);
            }
            break;
        case 'print':
            appendLine(m.text, '');
            break;
        case 'printErr':
            appendLine(m.text, 'err');
            break;
        case 'fps':
            showFps(m);
            break;
        case 'result':
            appendLine(engineLine(m.answer), m.answer.engine === 'error' || m.answer.engine === 'refused' ? 'err' : 'engine');
            status.textContent = m.answer.mainLoop ? 'running' : 'done';
            if (!m.answer.mainLoop) { stopBtn.disabled = true; showFps(null); }
            break;
        default:
            break;
    }
});

runBtn.addEventListener('click', () => run());

// The phone's menu (style.css folds Examples, Spices, Share and the theme
// into it below 800px; wider, the button is hidden and this is inert).  It
// closes on a second tap, a tap outside the toolbar, Escape, or once an
// example is picked or a link shared.
const toolbar = document.querySelector('.toolbar');
const menuBtn = document.getElementById('menu-btn');
function setMenu(open) {
    if (open) toolbar.dataset.menu = 'open'; else delete toolbar.dataset.menu;
    menuBtn.setAttribute('aria-expanded', String(open));
}
menuBtn.addEventListener('click', () => setMenu(toolbar.dataset.menu !== 'open'));
document.addEventListener('click', (e) => { if (!toolbar.contains(e.target)) setMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
examples.addEventListener('change', () => setMenu(false));
document.getElementById('share-btn').addEventListener('click', () => setMenu(false));
document.getElementById('minimap-btn').addEventListener('click', () => setMenu(false));
stopBtn.addEventListener('click', () => stop());

for (const [key, ex] of Object.entries(EXAMPLES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = ex.title;
    examples.appendChild(opt);
}
// A ?example=NAME link opens on that example (P4), and with &run runs it as
// soon as the editor is up.  A #code= link wins: it is an edited program.
const linked = linkedExample();
if (linked && EXAMPLES[linked.name]) examples.value = linked.name;
textarea.value = EXAMPLES[examples.value].src;

// The program survives a reload (as on the C playground): kept in
// localStorage, with the example it started from, as the visitor types.  It
// opens when the URL names nothing -- a #code= link or a ?example= link wins
// -- and storage that is blocked or full only means nothing is kept
// (storage.js).
const PROGRAM_KEY = 'arcade.program';
function savedProgram() {
    try {
        const p = JSON.parse(readStored(PROGRAM_KEY) || 'null');
        return p && typeof p.src === 'string' ? p : null;
    } catch (_) { return null; }
}
const saved = linked ? null : savedProgram();
if (saved) {
    if (EXAMPLES[saved.example]) examples.value = saved.example;
    textarea.value = saved.src;
}
const saveProgram = () => editor && writeStored(PROGRAM_KEY,
    JSON.stringify({ src: editor.getValue(), example: examples.value }));
let saveTimer = null;
window.addEventListener('pagehide', () => { clearTimeout(saveTimer); saveProgram(); });

// The dividers: the editor | the screen and console, and the screen | the
// console (split.js; hidden on a phone).
initSplit(document.querySelector('.panes'), document.getElementById('split-main'),
          { prop: '--split-h', key: 'arcade.split.h', axis: 'x', initial: 0.5 });
initSplit(document.getElementById('right'), document.getElementById('split-screen'),
          { prop: '--split-v', key: 'arcade.split.v', axis: 'y', initial: 0.55 });

// The example the editor holds unedited, or null: that is shared, and kept
// in the URL, as its ?example= link.
const pristine = () => (editor && editor.getValue() === EXAMPLES[examples.value].src ? examples.value : null);

// The language server: `tur lsp` in the stock module, in the worker that
// comes with the engine (engine/lsp-worker.js), with every spice the engine
// offers mounted, so `(import raylib/core ...)` resolves as it does when the
// program runs.  A second wasm instance, so it starts on the editor's first
// focus rather than at load: a visitor who only runs examples never pays for
// it.  If it never boots, the editor is just an editor.
const LSP_LABELS = { booting: 'starting analysis...', analyzing: 'analyzing...', idle: 'analysis ready' };
let lsp = null;
function setLspStatus(state) {
    const el = document.getElementById('lsp-status');
    if (!el) return;
    el.hidden = state === 'unavailable';
    el.dataset.state = state;
    el.textContent = LSP_LABELS[state] || '';
}
function startLsp() {
    if (lsp || editor.kind !== 'monaco') return lsp ? lsp.start() : Promise.resolve(false);
    lsp = createLspClient({
        monaco: editor.monaco,
        languageId: 'turmeric',
        workerUrl: '/engine/lsp-worker.js',
        // One document: the program.
        getTabs: () => [{ id: 'main', name: 'main.tur', _model: editor.editor.getModel() }],
        onStatus: setLspStatus,
    });
    return lsp.start();
}

// window.arcade (what the tests drive) appears once the editor is up, Monaco
// or the textarea it falls back to.
async function startEditor() {
    // A #code= link opens on its program instead of the first example.
    const shared = await sharedProgram();
    if (shared) textarea.value = shared;
    editor = await createEditor(textarea);
    followEditor(editor, pristine);
    editor.onChange(() => { clearTimeout(saveTimer); saveTimer = setTimeout(saveProgram, 300); });
    if (linked && !EXAMPLES[linked.name]) {
        appendLine(`Error: there is no example called "${linked.name}"; the menu lists them`, 'err');
    }
    document.getElementById('share-btn').addEventListener('click', async () => {
        const { url, copied } = await shareLink(editor, pristine);
        if (!url) appendLine('Error: could not make a link to this program', 'err');
        else if (copied) status.textContent = 'link copied';
        else appendLine(`share link: ${url}`, 'engine');
    });
    editor.onRun(() => run());
    if (editor.kind === 'monaco') {
        // Ctrl/Cmd+S: the program is kept as it is typed anyway; this keeps
        // it now, and keeps the browser's own Save Page dialog away.
        editor.editor.addCommand(editor.monaco.KeyMod.CtrlCmd | editor.monaco.KeyCode.KeyS, () => {
            clearTimeout(saveTimer);
            saveProgram();
            status.textContent = 'saved in this browser';
        });
        const pos = document.getElementById('cursor-pos');
        const show = (p) => { pos.hidden = false; pos.textContent = `Ln ${p.lineNumber}, Col ${p.column}`; };
        show(editor.editor.getPosition() || { lineNumber: 1, column: 1 });
        editor.editor.onDidChangeCursorPosition((e) => show(e.position));
    }
    if (editor.kind === 'monaco') {
        minimap = initMinimap({ monaco: editor.monaco, editor: editor.editor, host: editor.host,
                                button: document.getElementById('minimap-btn') });
        const once = editor.editor.onDidFocusEditorText(() => { once.dispose(); startLsp(); });
    }
    examples.addEventListener('change', () => {
        editor.setValue(EXAMPLES[examples.value].src);
        window.history.replaceState(null, '', exampleUrl(examples.value, false));
    });
    initSpicesMenu(editor, document.getElementById('spice-list'));
    window.arcade = {
        run,
        stop,
        setSource: (src) => { editor.setValue(src); },
        getSource: () => editor.getValue(),
        get editorKind() { return editor.kind; },
        // Whether the minimap is showing, and the visitor's stored choice.
        minimap: () => (minimap ? { on: minimap.enabled(), preference: minimap.preference() } : null),
        clearConsole: () => { consoleEl.replaceChildren(); },
        setView,
        get lastBoot() { return lastBoot; },
        get lastFps() { return lastFps; },
        saveNow: () => { clearTimeout(saveTimer); saveProgram(); },
        // The language server, for specs: start it (as a focus would), and read
        // the markers it set, which live in Monaco, a module import.
        lsp: {
            start: () => startLsp(),
            isBusy: () => !!(lsp && lsp.isBusy()),
            markers: () => (editor.kind === 'monaco'
                ? editor.monaco.editor.getModelMarkers({ owner: 'turmeric' })
                    .map((m) => ({ message: m.message, severity: m.severity, line: m.startLineNumber }))
                : []),
        },
    };
    if (linked && linked.run && !shared && EXAMPLES[linked.name]) run();
}
startEditor();

// The service worker (vite.config.js pwa()): in a build only. A new version
// waits until the visitor says so -- the status bar offers it -- rather than
// reloading the page and the program in it.
const updateSW = registerSW({
    onNeedRefresh() {
        status.textContent = '';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'status-action';
        b.textContent = 'a new version is ready: reload';
        b.addEventListener('click', () => updateSW(true));
        status.appendChild(b);
    },
    onOfflineReady() { status.textContent = 'ready to work offline'; },
});
