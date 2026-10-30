// main.js -- the arcade page: an editor, a Run and a Stop, the screen pane and
// the console.  Run puts the program in a fresh iframe (screen.html), whose
// shell boots the engine and runs it; the console shows what it prints and
// the engine line when main returns.  Stop removes the iframe.  The contract
// between the two is at the top of screen.js.

import { EXAMPLES } from './examples.js';

const editor = document.getElementById('editor');
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
    if (src !== undefined) editor.value = src;
    pending = { src: editor.value, args: '' };
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
            appendLine(engineLine(m.answer), m.answer.engine === 'error' ? 'err' : 'engine');
            status.textContent = m.answer.mainLoop ? 'running' : 'done';
            if (!m.answer.mainLoop) stopBtn.disabled = true;
            break;
        default:
            break;
    }
});

runBtn.addEventListener('click', () => run());
stopBtn.addEventListener('click', () => stop());
editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
});

for (const [key, ex] of Object.entries(EXAMPLES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = ex.title;
    examples.appendChild(opt);
}
examples.addEventListener('change', () => { editor.value = EXAMPLES[examples.value].src; });
editor.value = EXAMPLES[examples.value].src;

window.arcade = {
    run,
    stop,
    setSource: (src) => { editor.value = src; },
    clearConsole: () => { consoleEl.replaceChildren(); },
    get lastBoot() { return lastBoot; },
};
