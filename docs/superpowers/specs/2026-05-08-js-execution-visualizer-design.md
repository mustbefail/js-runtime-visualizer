# JS Runtime Visualizer — Design Spec

**Date:** 2026-05-08
**Status:** Draft (post-brainstorm, awaiting plan)
**Author:** Viktor Kushnir (viktor.kushnir@djangostars.com)

## 1. Goal & audience

Browser app that visualises how JavaScript code executes step by step. Primary user is the author (pet project, deepening JS internals + portfolio). Secondary use case: rehearsing tricky interview snippets (output prediction, microtask order, prototype pollution, closure traps). Tertiary: educational tool for juniors.

The differentiator versus prior art (PythonTutor, Loupe, Promisees, jsv9000): one tool that combines call stack + scope chain + heap + prototype chain on a single canvas, with full time travel, draggable nodes, and ES5 / ES2015 inheritance both rendered explicitly.

## 2. Scope

### MVP (v1)

Synchronous JavaScript only. The interpreter accepts arbitrary JS that uses these features:

- `let` / `const` / `var`, function declarations and expressions, arrow functions
- Lexical scope, closures, `this` binding
- Object and array literals, property access, mutation
- `function`-style constructors with `new`
- `class` / `extends` / `super`
- Manual prototype manipulation: `Object.create`, `Object.getPrototypeOf`, `__proto__`, assigning to `.prototype`
- Prototype chain lookups, prototype pollution scenarios
- Throw / try / catch, runtime errors with traceback
- `console.log` (and minimal stringification)

### Out of scope for v1 (planned later)

- **v2:** async runtime — `Promise`, `setTimeout`, `setInterval`, `async`/`await`, microtask + macrotask queues, async stack traces
- **v3:** generators, `Symbol`, `Map`, `Set`, `Proxy`, `Reflect`, modules (`import`/`export`)
- **v4 (product polish):** example gallery, share-via-URL, GIF export, light theme

### Out of scope permanently

Full specification fidelity for edge cases (tagged template `raw`, `Symbol.toPrimitive`, `Proxy` traps, `Reflect.construct` with `NewTarget`, `with` statement, sloppy-mode quirks, deprecated `arguments.caller`, etc.). When the interpreter encounters an unsupported construct it raises `UnsupportedError` with a pointer to the AST node and a "planned for vN / not planned" note. This is an explicit limit, not a silent failure.

## 3. Architecture

Two layers connected by an event stream. Engine is pure TypeScript (no DOM); UI is React. They communicate via the `SnapshotStore`.

```
┌──────────────────── App (React) ────────────────────┐
│                                                     │
│  Editor (CodeMirror 6)                              │
│        │                                            │
│        ▼ Run                                        │
│  ┌──── Engine (pure TS, no DOM) ────┐               │
│  │  Parser → Evaluator (generator)  │               │
│  │            │                     │               │
│  │            ▼                     │               │
│  │     RuntimeModel                 │               │
│  │   (frames, heap, scope, builtins)│               │
│  │            │                     │               │
│  │            ▼ events              │               │
│  │      SnapshotStore               │               │
│  └──────────│──────────────────────┘                │
│             ▼                                       │
│   Visualizer (canvas + panels, reads snapshots)     │
└─────────────────────────────────────────────────────┘
```

Engine runs once per Run click; produces an immutable array of snapshots. Visualizer is a function of the current snapshot index. Time travel is `setIndex(i)`.

### 3.1 Approach choice — tree-walking interpreter

Considered alternatives:
- **B. Babel-instrumentation + iframe sandbox** — real engine semantics for free, but cannot pause mid-expression, time travel impossible without a parallel state model, prototype graph requires shadow heap via WeakMap.
- **C. Generator-transform via Babel** — every function rewritten to a generator. Real semantics + pause, but try/catch + generators interact awkwardly, async-inside-generator is hard, heap visualisation still needs shadow model.
- **A. Tree-walking interpreter (chosen)** — parse with Acorn, walk AST, maintain own runtime model. Most code, but only one source of truth, perfect time travel, prototype chain rendered exactly as we choose, scales to async via inserting a runtime queue layer in v2.

Decisive factor: MVP is centred on prototypes and heap. B/C double the work because they need a shadow heap anyway.

## 4. Engine modules

### 4.1 `parser.ts`
Wraps Acorn. Single export `parse(code: string): { ok: true, ast } | { ok: false, error: { message, line, col } }`. No transformation, no normalisation — Acorn AST as-is.

### 4.2 `runtime/model.ts`
Type definitions for the custom object model. Sketch (final names may shift):

```ts
type JSValue = Primitive | Reference;
type Reference = { id: string };

type HeapObject = {
  id: string;
  kind: 'object' | 'array' | 'function';
  ownProps: Map<string, JSValue>;
  prototype: Reference | null;     // [[Prototype]]
  // function-only:
  closure?: EnvironmentRecord;     // [[Environment]] — hidden field per spec
  source?: ASTNode;
};

type EnvironmentRecord = {
  bindings: Map<string, JSValue>;
  outer: EnvironmentRecord | null;
};

type Frame = {
  fn: Reference | 'global';
  env: EnvironmentRecord;
  callSite: { line: number; col: number } | null;  // where this frame was invoked from
  returnTo: ASTNode | null;
};
```

The model is **not** a wrapper around real JS objects. `[[Prototype]]` is a field we control. Prototype pollution becomes a normal write to the model.

### 4.3 `runtime/heap.ts`
A `Map<id, HeapObject>` with `allocate`, `get`, `set`, `delete`. Includes `gcEligible(rootSet: Reference[]): id[]` — used to fade orphan nodes between steps after explicit prototype rewires.

### 4.4 `evaluator.ts`
Recursive AST walker, implemented as a TypeScript generator. Each significant evaluation step yields a `StepEvent`. The runner outside the generator pumps it, captures snapshots, then resumes. This gives natural pause, drill-in, and statement-vs-expression granularity from one mechanism.

Granularity model (hybrid, per user choice):
- Default: yield once per **statement**.
- "Drill-in" toggle: also yield per **expression / sub-expression** (`1+2*3` becomes three steps: evaluate `2*3`, evaluate `1+6`, assign).

Drill-in is implemented as a runtime flag inspected by the generator at each yield point, not as two separate evaluators.

### 4.5 `runtime/builtins.ts`
A small library of host objects represented as `HeapObject`s in the same heap: `Object`, `Object.prototype`, `Array.prototype`, `Function.prototype`, `Object.create`, `Object.getPrototypeOf`, `console.log`, basic operator support objects. Without these, `class ... extends ...` cannot work because the `extends` semantics walks `Function.prototype`.

## 5. Snapshot store & time travel

### 5.1 Step events

```ts
type StepEvent = {
  kind:
    | 'enter-frame' | 'leave-frame'
    | 'assign'      | 'allocate' | 'lookup'
    | 'mutate'      | 'gc'
    | 'console'
    | 'error'       | 'unwind-frame' | 'catch';
  loc: { line: number; col: number; nodeType: string };
  payload: object;  // event-specific
};
```

### 5.2 Snapshots

After every event the runner records a `Snapshot`:

```ts
type Snapshot = {
  step: number;
  loc: { line: number; col: number };
  eventKind: StepEvent['kind'];
  callStack: Frame[];               // immutable copy
  heap: Map<string, HeapObject>;    // immutable copy
  consoleOut: string[];
  highlights: {
    lookupPath?: string[];          // ids walked during property lookup
    changedIds?: string[];          // recently mutated/allocated heap ids
    activeFrame?: number;           // index in callStack
  };
};
```

Structural sharing via **Immer**: each snapshot is a small structural diff over the previous one. Memory cost ≈ O(total mutations), not O(N × heap size).

### 5.3 Time travel

`SnapshotStore` is `Snapshot[]`. UI keeps `currentStepIndex`. Scrubber, prev/next, play/pause, jump-from-log are all `setIndex(i)`. Forward play uses `requestAnimationFrame` to advance the index at a configurable speed.

## 6. UI structure

### 6.1 Layout

```
Toolbar           — Run · Reset · Examples ▾ · Speed · drill-in toggle
EditorPane        — CodeMirror 6, current line marker in gutter
CanvasPane        — pan/zoom SVG
  FramesLayer       — call stack frames (left half), draggable, collapsible
  HeapLayer         — heap objects (right half), draggable, collapsible
  EdgesLayer        — references / [[Scope]] / closure / lookup arrows
  Legend            — fixed corner
EngineLogPane     — events list with jump-to-step (replaced by TracebackPanel on error)
ConsolePane       — console.log lines
Scrubber          — ⏮ ◀ ▶/⏸ ▶▶ ⏭ + slider 1..N + step counter
```

Outer layout: top toolbar; left ~40 % editor + console; right ~60 % canvas + engine log; scrubber spans full width at the bottom. Resizable splitters.

### 6.2 Canvas details

- All frames live on the canvas (left side), **draggable** by mouse, **collapsible** to a compact pill (function name + frame index).
- Heap objects live on the right side (also draggable, collapsible).
- `[[Environment]]` of a function appears as a separate block inside the function's heap node, labelled as a hidden field per spec. The arrow originates from this block.
- Edges:
  - solid teal — variable → object reference
  - solid violet — `[[Prototype]]`
  - dashed violet — `[[Scope]]` outer link
  - dashed orange — current lookup path (animated, transient)
  - dotted grey — `.prototype` property of constructor function (toggle to show)
  - solid red — error propagation (during unwind steps)
- Collapse rule: retained closure-scope frames auto-collapse when more than N (configurable, default 3) accumulate in a single chain.
- No graph-layout library. Initial positions: frames in left column top-down, heap nodes laid out in a simple grid by allocation order, then user repositions. Positions persist in UI state.

### 6.3 State

UI state in **Reatom** (atomic state). Atoms include:
- `currentStepIndex`
- `nodePositions: Map<id, {x, y}>`
- `collapsedIds: Set<id>`
- `panZoom`
- `drillInEnabled`
- `examples`
Engine state (snapshots) is separate, immutable, fed in once per Run.

### 6.4 Interactions

- Drag node → updates `nodePositions`; edges layer recomputes from current positions.
- Click frame / heap node → toggle collapse.
- Hover property → highlight owner along the prototype chain.
- Click event in `EngineLogPane` → jump to that step.
- Click line gutter in editor → jump to first step where that source location is active (deferred to v1.1 if scope creep).

### 6.5 Run model

Manual: a **Run** button kicks off engine execution. **Reset** clears snapshots and returns scrubber to step 0. No auto-run on edit (rejected; reserved for a possible v2 toggle).

## 7. Error handling

Three distinct UX paths:

1. **Parse errors** — Acorn `SyntaxError`. Result of `parse()` carries the error. UI: red gutter marker on the line, message in `EngineLogPane`, **Run** disabled until fixed. Scrubber inactive.
2. **Runtime errors** — evaluator yields an `error` event with the full call stack, then a sequence of `unwind-frame` events as the throw propagates up. If a `try/catch` matches, evaluator yields a `catch` event and resumes. Snapshots are recorded for all of these — the user can scrub through the unwind.
3. **Unsupported constructs** — `UnsupportedError` from the evaluator pointing at a specific AST node ("`Proxy` is not supported in v1, planned for v3"). Distinct UI banner — never imitate execution of a feature we don't model.

### 7.1 Traceback visualization

`TracebackPanel` (replaces `EngineLogPane` while an unhandled error is current):

```
⊗ ReferenceError: x is not defined
  ▶ at inner       (snippet.js:7)   ← throw site
  ↑ at middle      (snippet.js:4)
  ↑ at outer       (snippet.js:2)
  ↑ at <global>    (snippet.js:9)   ← caught here ✓ (if try/catch above)
```

- Each row clickable → jump to the snapshot where that frame was active.
- Hover row → highlight that line in the editor.
- During unwind animation: the thrown value (Error object) is a heap node with a red border; an animated red arrow walks up the stack one frame per step; popped frames fade out; the catching frame turns green when reached.
- In the editor: red squiggle on throw site, dotted markers connecting call sites along the chain.

The traceback uses data we already have (each `Frame.callSite` is already stored). New work: emit `unwind-frame` and `catch` events, render the panel.

## 8. Testing strategy

Engine is heavily tested; UI gets smoke tests only.

### 8.1 Engine unit tests (Vitest)

- **Parser sanity** — small set; regression-only.
- **Evaluator golden tests** — per feature file under `tests/evaluator/`:
  - `closures.test.ts`
  - `prototype-chain.test.ts`
  - `prototype-pollution.test.ts`
  - `this-binding.test.ts`
  - `classes.test.ts`
  - `es5-inheritance.test.ts`
  - `errors-and-traceback.test.ts`

  Each case is `(code, expected_event_subset, expected_final_value, expected_final_heap_summary)`.
- **Cross-check vs real V8** — for cases where semantics are not custom, run the same code through `new Function(code)()` in the test environment and compare values. Catches drift cheaply.
- **Snapshot store** — structural sharing actually shares memory (no leaks); time-travel forward/back returns equivalent state.
- **Traceback** — deep throw, unwinding step-by-step, catch at the right level.

### 8.2 UI smoke tests (Playwright)

Minimum viable set:
- Run flow: type code → click Run → frames and heap nodes appear.
- Scrubber: back/forward preserves node positions.
- Drag: position persists in Reatom store.
- Error flow: code with `throw` → `TracebackPanel` shows → click row → jumps.

### 8.3 Discipline

For every new AST node added to evaluator:
1. Write golden test with expected event sequence and final value.
2. Implement.
3. If real-JS analogue exists, add cross-check.

Out of v1: pixel-perfect snapshots, accessibility audit, mobile layout.

## 9. Tech stack

| Concern              | Choice           | Notes                                         |
|----------------------|------------------|-----------------------------------------------|
| Runtime / package mgr| Node             | Compatibility over Bun-quirks                 |
| Build / dev server   | Vite             | Fast HMR                                      |
| UI framework         | React + TypeScript | Familiar                                    |
| State management     | Reatom           | User preference                               |
| Editor               | CodeMirror 6     | ~150 KB, modular, embeddable                  |
| Parser               | Acorn            | ESTree-spec, tiny, well documented            |
| Immutable updates    | Immer            | For snapshots and Reatom transitions          |
| Tests                | Vitest + Playwright | Vitest for engine; Playwright for smoke    |
| Lint / format        | ESLint + Prettier | Project default                              |

No drag-and-drop library (drag is trivial), no graph-layout library (initial positions hand-rolled).

## 10. Risks

| Risk                                                              | Mitigation                                                                |
|-------------------------------------------------------------------|---------------------------------------------------------------------------|
| Snapshot count × Immer cost → UI lag on large code                | `MAX_STEPS = 10_000` ceiling with user warning; batch drill-in steps     |
| Subtle `this` semantics drift from V8 in nested arrows + classes  | Cross-check tests in §8.1                                                 |
| Heap with 100+ nodes becomes unreadable                           | Auto-collapse inherited prototypes by default; "auto-arrange" button; focus-on-selected |
| Custom builtins drift behind real prototypes                      | Builtins are tested through real-world snippets, not by spec memorisation |
| Scope creep into v2 features during MVP                           | Hard `UnsupportedError` for everything in §2's "out of scope"; visible banner |

## 11. Roadmap (post-MVP, non-binding)

- **v2** — async runtime: microtask + macrotask queues as docked panels, `Promise`, `setTimeout`, `async`/`await`, async stack traces (creation-stack stored on Promise).
- **v3** — generators, `Symbol`, collection types, `Proxy`/`Reflect`, single-file modules.
- **v4** — example gallery (closures, microtask order, prototype pollution), share-via-URL, GIF export, light theme.

## 12. Open questions deferred to plan stage

- Final shape of the `StepEvent.payload` per kind — fixed during `evaluator.ts` design.
- Exact CodeMirror 6 extensions (line marker, gutter, theme).
- Whether `console.log` value pretty-printing needs its own module or stays inline.
- Concrete `MAX_STEPS` and snapshot batching threshold — calibrate after first benchmark.
