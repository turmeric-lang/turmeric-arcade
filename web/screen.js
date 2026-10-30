// screen.js -- the screen pane's shell: one program's run, in its own iframe.
//
// The page (main.js) creates an iframe per run, loads this document in it,
// and the two talk by postMessage (raylib-web-playground-plan 5.2).  The
// shell boots the engine on the iframe's MAIN thread, where a canvas is, and
// the iframe is the teardown: Stop removes it, a second Run replaces it, and
// no module teardown is ever attempted.
//
// The contract, same origin both ways:
//
//   iframe -> page   {type: 'screen-ready'}            the shell is listening
//   page -> iframe   {type: 'run', src, args}          compile and run src
//   iframe -> page   {type: 'boot', ok, jspi, ms}      the engine is up (or
//                                                      not: error says why)
//   iframe -> page   {type: 'print' | 'printErr', text} one line of stdout or
//                                                      stderr, as the program
//                                                      writes it
//   iframe -> page   {type: 'result', answer}          main returned: the
//                                                      engine line
//
// The answer is the module's own JSON -- {engine: 'compiled' | 'interpreted'
// | 'error', exit, reason, front_ms, compile_ms, run_ms} -- or one the shell
// makes: {engine: 'error', exit: 1, trapped: true, reason} when the module
// threw (a wasm trap, or a stack overflow, which both stacks report through
// here), and {engine: 'compiled', exit: 0, mainLoop: true} when the program
// left main by Emscripten's `unwind`, which is how a run-main-loop program
// hands its frame loop to the browser: the program is still running then,
// and the iframe stays until Stop.
//
// Under JSPI turi_wasm_jit_run returns a Promise, which the shell awaits; a
// plain build returns the answer directly, and `await` takes both.

const ORIGIN = location.origin;
const ENGINE_DIR = '/engine';
const post = (msg) => window.parent.postMessage(msg, ORIGIN);
const body = document.body;
const canvas = document.getElementById('canvas');

// stdout/stderr, assembled into lines here so a partial last line still
// reaches the page with the run that printed it (turmeric's jit-worker.js).
const decoder = new TextDecoder('utf-8');
const stdoutStream = { bytes: [], type: 'print' };
const stderrStream = { bytes: [], type: 'printErr' };
function emitStreamLine(s) {
    const text = s.bytes.length ? decoder.decode(new Uint8Array(s.bytes)) : '';
    s.bytes.length = 0;
    post({ type: s.type, text });
}
function streamByte(s, byte) {
    if (byte === null) { flushStreams(); return; }
    if (byte === 0) return;
    if (byte === 10) { emitStreamLine(s); return; }
    s.bytes.push(byte);
}
function flushStreams() {
    if (stdoutStream.bytes.length) emitStreamLine(stdoutStream);
    if (stderrStream.bytes.length) emitStreamLine(stderrStream);
}

// Emscripten's abort when the linear stack's bound check fires: it prints
// this through printErr (noted and withheld, since the answer's reason
// carries it) and then throws -- `unreachable` under the wasm-native setjmp
// the module links with, so the stderr line is what identifies it.
const LINEAR_STACK_ABORT = 'Aborted(stack overflow';
let linearStackAborted = false;
function isStackOverflow(err) {
    if (err instanceof RangeError) return true;   // the JS stack limit
    if (linearStackAborted) return true;          // the linear stack's check
    return String(err && err.message ? err.message : err).startsWith(LINEAR_STACK_ABORT);
}
const isUnwind = (err) => err === 'unwind' || (err && err.message === 'unwind');

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`could not load ${src}`));
        document.head.appendChild(s);
    });
}

let mod = null;
async function boot() {
    const t0 = performance.now();
    if (typeof SharedArrayBuffer === 'undefined') {
        throw new Error('this page is not cross-origin isolated (no SharedArrayBuffer)');
    }
    await loadScript(`${ENGINE_DIR}/turmeric-jit.js`);
    const factory = window.TurmericJitModule;
    if (typeof factory !== 'function') throw new Error('TurmericJitModule not found');
    const m = await factory({
        canvas,
        locateFile: (p) => `${ENGINE_DIR}/${p}`,
        print: (text) => post({ type: 'print', text: String(text) }),
        printErr: (text) => {
            if (String(text).startsWith(LINEAR_STACK_ABORT)) linearStackAborted = true;
            else post({ type: 'printErr', text: String(text) });
        },
        stdout: (byte) => streamByte(stdoutStream, byte),
        stderr: (byte) => streamByte(stderrStream, byte),
    });
    if (m._turi_wasm_init() !== 0) throw new Error('turi_wasm_init failed');
    mod = m;
    return { jspi: 'Suspending' in WebAssembly, ms: performance.now() - t0 };
}

function cString(str) {
    const len = mod.lengthBytesUTF8(str) + 1;
    const ptr = mod._malloc(len);
    mod.stringToUTF8(str, ptr, len);
    return ptr;
}

async function run(src, args) {
    linearStackAborted = false;
    body.dataset.state = 'running';
    canvas.focus();
    let answer;
    try {
        // The strings stay allocated across the await: a suspended run still
        // reads them.
        const srcPtr = cString(src);
        const argsPtr = cString(args);
        let resultPtr;
        try {
            resultPtr = await mod._turi_wasm_jit_run(srcPtr, argsPtr);
        } finally {
            mod._free(srcPtr);
            mod._free(argsPtr);
        }
        flushStreams();
        const text = resultPtr ? mod.UTF8ToString(resultPtr) : '';
        if (resultPtr) mod._turi_wasm_free_string(resultPtr);
        try { answer = JSON.parse(text); }
        catch (_) { answer = { engine: 'error', exit: 1, reason: 'the module gave no answer' }; }
    } catch (err) {
        flushStreams();
        if (isUnwind(err)) {
            answer = { engine: 'compiled', exit: 0, mainLoop: true };
        } else {
            const first = String(err && err.message ? err.message : err).split('\n')[0];
            answer = {
                engine: 'error', exit: 1, trapped: true,
                reason: isStackOverflow(err) ? 'stack overflow: recursion too deep'
                                             : `the compiled program trapped: ${first}`,
            };
        }
    }
    body.dataset.state = answer.mainLoop ? 'main-loop' : 'done';
    post({ type: 'result', answer });
}

// The screen's keys stay on the screen: arrows, Space and Tab scroll or move
// focus in the page otherwise.  Inside this iframe only, so the editor keeps
// its own.
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab']);
canvas.addEventListener('keydown', (e) => { if (GAME_KEYS.has(e.key)) e.preventDefault(); });
canvas.addEventListener('keyup', (e) => { if (GAME_KEYS.has(e.key)) e.preventDefault(); });
canvas.addEventListener('click', () => canvas.focus());

let started = false;
window.addEventListener('message', async (e) => {
    if (e.origin !== ORIGIN || e.source !== window.parent) return;
    const m = e.data;
    if (!m || m.type !== 'run') return;
    if (started) {
        post({ type: 'printErr', text: 'this screen already ran a program; Run again opens a new one' });
        return;
    }
    started = true;
    body.dataset.state = 'booting';
    try {
        const b = await boot();
        post({ type: 'boot', ok: true, ...b });
    } catch (err) {
        body.dataset.state = 'failed';
        post({ type: 'boot', ok: false, error: String(err && err.message ? err.message : err) });
        return;
    }
    await run(String(m.src || ''), String(m.args || ''));
});

if (window.parent !== window) {
    body.dataset.state = 'ready';
    post({ type: 'screen-ready' });
} else {
    body.dataset.state = 'standalone';
}
