// main.js -- the arcade page: an editor, a Run and a Stop, the screen pane and
// the console.  Run puts the program in a fresh iframe (screen.html), whose
// shell boots the engine and runs it; the console shows what it prints and
// the engine line when main returns.  Stop removes the iframe.  The contract
// between the two is at the top of screen.js.

import { EXAMPLES } from './examples.js';
import { createEditor } from './editor.js';
import { createLspClient } from './lsp-client.js';
import { initSpicesMenu } from './spices-menu.js';

// The textarea until Monaco has loaded (editor.js), then Monaco.
let editor = null;
const textarea = document.getElementById('editor');
const runBtn = document.getElementById('run-btn');
const stopBtn = document.getElementById('stop-btn');
const examples = document.getElementById('examples');
const status = document.getElementById('status');
const screenHost = document.getElementById('screen-host');
const consoleEl = document.getElementById('console');

let frame = null;       // the current run's iframe, or null
let pending = null;     // the program the next 'screen-ready' runs
let lastBoot = null;    // the last run's 'boot' message (tests read it)

function appendLine(text, cls) {
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
    runBtn.textContent = on ? 'Run again' : 'Run';
    stopBtn.disabled = !on;
    document.body.dataset.run = on ? 'running' : 'idle';
}

function stop(quiet) {
    if (!frame) return;
    frame.remove();
    frame = null;
    pending = null;
    if (!quiet) appendLine('-- stopped', 'engine');
    status.textContent = '';
    setRunning(false);
}

function run(src) {
    stop(true);
    lastBoot = null;
    if (src !== undefined) editor.setValue(src);
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
                status.textContent = `engine up in ${ms(m.ms)}${spices}${m.jspi ? '' : ' (no JSPI: a frame loop cannot yield)'}`;
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
        case 'result':
            appendLine(engineLine(m.answer), m.answer.engine === 'error' || m.answer.engine === 'refused' ? 'err' : 'engine');
            status.textContent = m.answer.mainLoop ? 'running' : 'done';
            if (!m.answer.mainLoop) stopBtn.disabled = true;
            break;
        default:
            break;
    }
});

runBtn.addEventListener('click', () => run());
stopBtn.addEventListener('click', () => stop());

for (const [key, ex] of Object.entries(EXAMPLES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = ex.title;
    examples.appendChild(opt);
}
textarea.value = EXAMPLES[examples.value].src;

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
    editor = await createEditor(textarea);
    editor.onRun(() => run());
    if (editor.kind === 'monaco') {
        const once = editor.editor.onDidFocusEditorText(() => { once.dispose(); startLsp(); });
    }
    examples.addEventListener('change', () => { editor.setValue(EXAMPLES[examples.value].src); });
    initSpicesMenu(editor, document.getElementById('spice-list'));
    window.arcade = {
        run,
        stop,
        setSource: (src) => { editor.setValue(src); },
        getSource: () => editor.getValue(),
        get editorKind() { return editor.kind; },
        clearConsole: () => { consoleEl.replaceChildren(); },
        get lastBoot() { return lastBoot; },
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
}
startEditor();
