// hover-docs.js -- a builtin's or a library function's line of documentation
// on hover (raylib-web-playground-plan, editor phase: hover docs).
//
// The language server's hover gives a name's type -- println's overloads,
// vec-push!'s signature -- and no words; for a name it has no binding for it
// gives nothing.  The words are in the doc table the engine ships
// (engine/doc-names.json: the stdlib and the packaged spices, one summary
// line a name, made by turmeric's tools/wasm-jit/arcade/doc-names.py).  Try
// Turmeric shows that line only when the server has nothing
// (lsp-client.js docFallbackHover); here it is a hover provider of its own,
// so it shows under the type as well, and lsp-client.js stays Try's.  Monaco
// puts every provider's answer in the one hover.
//
// The line says where it is from, since it is the library's account of the
// name, not the checker's: and a name the program defines itself gets none,
// because then the library's line would be about something else.

const DEFINERS = 'defn|def|defmacro|defstruct|defopaque|defclass|defeffect|deftype|defenum';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function registerHoverDocs(monaco, url) {
    let table = null;
    let loading = null;
    const load = () => loading || (loading = fetch(url)
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => { table = new Map(list.map((d) => [d.name, d])); })
        .catch(() => { table = new Map(); }));

    const provider = monaco.languages.registerHoverProvider('turmeric', {
        async provideHover(model, position) {
            const word = model.getWordAtPosition(position);
            if (!word) return null;
            await load();
            const entry = table.get(word.word);
            if (!entry || !entry.summary) return null;
            const defined = new RegExp(`\\((?:${DEFINERS})\\s+${escape(word.word)}(?=[\\s\\[\\])])`);
            if (defined.test(model.getValue())) return null;
            const from = entry.spice ? `_from the ${entry.spice} spice's docs_` : '_from the stdlib docs_';
            return {
                contents: [{ value: `${entry.summary}\n\n${from}` }],
                range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
            };
        },
    });
    return { load, dispose: () => provider.dispose(), lookup: (name) => (table ? table.get(name) || null : null) };
}
