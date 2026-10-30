// examples.js -- the Examples menu.  Plain programs for now: the engine is
// turmeric's JIT module as it is, without raylib, so what these show is the
// run itself -- a sleeping frame loop that streams its lines while the page
// stays live is the shape a raylib loop will have.  The plan's examples/ tree
// (one .tur file per game, read at build time) replaces this table.
export const EXAMPLES = {
    hello: {
        title: 'Hello',
        src: `(defn main [] : int
  (println "hello, arcade")
  (println (+ 40 2))
  0)
`,
    },
    frames: {
        title: 'A frame loop (sleeps between frames)',
        src: `;; A frame loop: state in ^mut bindings, a while, and a sleep per frame.
;; emscripten_sleep suspends the program and lets the page run, so the lines
;; below appear one by one while the loop is still going.
(defn nap [ms : int] : void
  \`\`\`c
  extern void emscripten_sleep(unsigned int);
  emscripten_sleep((unsigned int)ms);
  \`\`\`)

(defn main [] : int
  (let [^mut frame 0
        ^mut x     7.1]
    (while (< frame 6)
      (nap 250)
      (set! x (+ x 0.25))
      (println x)
      (set! frame (+ frame 1)))
    0))
`,
    },
    fib: {
        title: 'Fibonacci',
        src: `(defn fib [n : int] : int
  (if (< n 2) n (+ (fib (- n 1)) (fib (- n 2)))))

(defn main [] : int
  (println (fib 27))
  0)
`,
    },
};
