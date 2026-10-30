// examples.js -- the Examples menu, read from the repository's examples/
// tree at build time: one program per file, in file-name order, titled by the
// first line of its `;;;` header (`;;; name -- Title`).  web/tests/
// raylib.spec.js runs the same files, so what the menu offers is what CI
// runs.
const FILES = import.meta.glob('../examples/*.tur', { query: '?raw', import: 'default', eager: true });

function entry(path, src) {
    const key = path.replace(/^.*\/(?:\d+-)?/, '').replace(/\.tur$/, '');
    const head = src.match(/^;;;\s*[^\n]*?--\s*(.+)$/m);
    return [key, { title: head ? head[1].trim() : key, src }];
}

export const EXAMPLES = Object.fromEntries(
    Object.keys(FILES).sort().map((path) => entry(path, FILES[path])));
