// examples.js -- the Examples menu.  Plain programs for now: the engine is
// turmeric's JIT module as it is, without raylib, so what these show is the
// run itself -- a sleeping frame loop that streams its lines while the page
// stays live is the shape a raylib loop will have.  The plan's examples/ tree
// (one .tur file per game, read at build time) replaces this table.
export const EXAMPLES = {
    raylib: {
        title: 'Hello, raylib',
        src: `;; The raylib README's quick start, as a program: the blocking frame loop
;; runs unchanged on the page because the engine suspends it each frame
;; (JSPI). The spices are the engine's own; nothing is fetched.
(defmodule hello
  (export)
  (import raylib/core  :refer [init-window window-should-close begin-drawing
                               end-drawing clear-background])
  (import raylib/text  :refer [draw-text])
  (import raylib/color :refer [raywhite black])

  (defn main [] : int
    (init-window 480 270 "hello")
    (while (not (window-should-close))
      (begin-drawing)
      (clear-background (raywhite))
      (draw-text "Hello, Turmeric!" 120 120 20 (black))
      (end-drawing))
    0))
`,
    },
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
