// defscript.js -- reading and rewriting a program's `defscript` header, the
// text the Spices menu edits (raylib-web-playground-plan 5.3):
//
//   (defscript :spices #map{"raylib" #map{:url "..." :ref "..." :subdir "spices/raylib"}})
//
// The header is the real form, so a program copied out of the page runs
// natively with `tur --enable=script-deps` and fetches the same spices; on the
// page the engine satisfies it from the packages it carries.  It is the
// program's first form: only a `#!` line, a `#lang` line, comments and
// whitespace may come before it (pkg_text_is_preamble in turmeric's pkg.c).
//
// Plain text functions, no Monaco: the buffer is the source of truth, and the
// menu only ever rewrites the header's own span.

export const SPICES_URL = 'https://github.com/turmeric-lang/turmeric-spices';

// The offset just past the preamble: `#!` and `#lang` lines, `;` comments,
// `#| ... |#` block comments and whitespace.
export function preambleEnd(src) {
    let i = 0;
    for (;;) {
        while (i < src.length && /\s/.test(src[i])) i++;
        if (src.startsWith('#|', i)) {
            const j = src.indexOf('|#', i + 2);
            i = j < 0 ? src.length : j + 2;
        } else if (src[i] === ';' || src.startsWith('#!', i) || src.startsWith('#lang', i)) {
            const j = src.indexOf('\n', i);
            i = j < 0 ? src.length : j + 1;
        } else {
            return i;
        }
    }
}

// The end (exclusive) of the balanced form opening at `open` (`(`, `[` or `{`
// at src[open], or a `#map{`'s brace), skipping strings and `;` comments; -1
// when it never closes.
function formEnd(src, open) {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '"') {
            for (i++; i < src.length && src[i] !== '"'; i++) if (src[i] === '\\') i++;
        } else if (c === ';') {
            while (i < src.length && src[i] !== '\n') i++;
        } else if (c === '(' || c === '[' || c === '{') {
            depth++;
        } else if (c === ')' || c === ']' || c === '}') {
            if (--depth === 0) return i + 1;
        }
    }
    return -1;
}

// The header's span, or null when the first form is not a `defscript`.
export function findHeader(src) {
    const start = preambleEnd(src);
    if (!/^\(defscript(?=[\s)])/.test(src.slice(start, start + 11))) return null;
    const end = formEnd(src, start);
    return end < 0 ? null : { start, end };
}

// The header's :spices entries, each {name, raw} with raw the entry's own
// text (`"name" #map{...}`), in order; null when the header has no :spices
// map the menu can read (it then leaves the header alone).
export function headerEntries(headerText) {
    const m = headerText.match(/:spices\s+#map\{/);
    if (!m) return null;
    const mapOpen = m.index + m[0].length - 1;
    const mapEnd = formEnd(headerText, mapOpen);
    if (mapEnd < 0) return null;
    const entries = [];
    let i = mapOpen + 1;
    while (i < mapEnd - 1) {
        const key = /^\s*"([^"]+)"\s*#map\{/.exec(headerText.slice(i, mapEnd));
        if (!key) break;
        const valOpen = i + key[0].length - 1;
        const valEnd = formEnd(headerText, valOpen);
        if (valEnd < 0) return null;
        entries.push({ name: key[1], raw: headerText.slice(i + key[0].indexOf('"'), valEnd) });
        i = valEnd;
    }
    return entries;
}

// The spice names a program's header declares (empty without one).
export function headerSpices(src) {
    const h = findHeader(src);
    const entries = h ? headerEntries(src.slice(h.start, h.end)) : null;
    return entries ? entries.map((e) => e.name) : [];
}

export function entryFor(name, ref) {
    return `"${name}" #map{:url "${SPICES_URL}" :ref "${ref}" :subdir "spices/${name}"}`;
}

const HEAD = '(defscript :spices #map{';
function render(raws) {
    return HEAD + raws.join('\n' + ' '.repeat(HEAD.length)) + '})';
}

// `src` with its header declaring exactly the offered spices in `names`:
// entries for spices the menu does not offer are kept as written, a kept
// offered entry keeps its own text, a new one is pinned to `ref` (the
// turmeric-spices commit the engine's packages came from).  No entries left
// removes the header; none before inserts one after the preamble's #!/#lang
// lines.  Returns null when the existing header cannot be read.
export function setHeaderSpices(src, names, offered, ref) {
    const want = new Set(names);
    const h = findHeader(src);
    const existing = h ? headerEntries(src.slice(h.start, h.end)) : [];
    if (existing === null) return null;
    const kept = existing.filter((e) => !offered.includes(e.name) || want.has(e.name));
    const have = new Set(kept.map((e) => e.name));
    const raws = kept.map((e) => e.raw)
        .concat(names.filter((n) => !have.has(n)).map((n) => entryFor(n, ref)));
    if (h) {
        if (!raws.length) return src.slice(0, h.start) + src.slice(h.end).replace(/^[ \t]*\n/, '');
        return src.slice(0, h.start) + render(raws) + src.slice(h.end);
    }
    if (!raws.length) return src;
    // After the #!/#lang lines only: a comment block that opens the program
    // reads as its description, so the header goes above it.
    let at = 0;
    while (src.startsWith('#!', at) || src.startsWith('#lang', at)) {
        const j = src.indexOf('\n', at);
        at = j < 0 ? src.length : j + 1;
    }
    return src.slice(0, at) + render(raws) + '\n' + src.slice(at);
}
