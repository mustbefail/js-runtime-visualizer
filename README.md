# JS Runtime Visualizer

Browser app that visualises how JavaScript code executes step by step. Built around a custom tree-walking interpreter that produces an immutable stream of snapshots, then rendered on an interactive canvas with draggable call frames, heap nodes, and full time travel.

> **Status:** plan 1 of 5 complete — headless engine library is feature-complete for the synchronous subset. UI work begins in plan 2.

## Goal

A single tool that combines call stack + scope chain + heap + prototype chain on one canvas, with full time-travel scrubbing, draggable nodes, and ES5 / ES2015 inheritance both rendered explicitly. Differentiator vs PythonTutor / Loupe / Promisees — covers all four runtime aspects together.

## Project layout

```
js-runtime-visualizer/
├── docs/
│   └── superpowers/
│       ├── specs/                       ← design spec (single source of truth for goals)
│       ├── plans/                       ← per-phase implementation plans
│       └── plan-1-carry-over.md         ← items deferred from plan 1 to later plans
├── packages/
│   └── engine/                          ← @js-runtime-visualizer/engine
│       ├── src/
│       │   ├── index.ts                 ← public API
│       │   ├── types.ts                 ← central type contracts (interfaces + aliases)
│       │   ├── parser.ts                ← Acorn wrapper
│       │   ├── runtime/                 ← Heap, EnvironmentRecord, CallStack, builtins
│       │   ├── evaluator/               ← AST-walking generator + node handlers
│       │   └── snapshot.ts              ← immutable snapshot store
│       └── tests/                       ← Vitest, 61 passing
└── package.json                         ← npm workspace root
```

## Quick start

```bash
npm install
npm test       # 61 tests across parser, heap, env, snapshot, evaluator, integration, cross-check
```

**Run the app (dev mode):**

```bash
npm run ui:dev   # serves http://localhost:5173
```

## Try the engine

```ts
import { runCode } from '@js-runtime-visualizer/engine';

const { snapshots, finalValue } = runCode(`
  function makeCounter() {
    let n = 0;
    return () => ++n;
  }
  const inc = makeCounter();
  inc(); inc(); inc();
`);

console.log(finalValue);       // { kind: 'number', value: 3 }
console.log(snapshots.length); // each step recorded as an immutable snapshot
```

## Roadmap

- [x] **Plan 1** — headless engine: parser, runtime model, evaluator (literals → control flow → functions → closures → objects), `console.log`, snapshot store, drill-in stepping. _Completed 2026-05-08._
- [x] **Plan 2** — UI shell: Vite + React + Reatom + CodeMirror, Run button, textual snapshot view, time-travel scrubber, session persisted in `localStorage`. Engine snapshots now share `HeapObject` references across steps. _Completed 2026-05-08._
- [x] **Plan 3** — canvas visualisation: pan/zoom SVG canvas, draggable frames + heap nodes, reference edges, collapse, position persistence. _Completed 2026-05-08._
- [x] **Plan 4** — prototypes & inheritance: `Object.create`, `__proto__`, `class`/`extends`/`super`, `new`, `this` binding, `Function.prototype.call`, `var`/function-decl hoisting, logical/conditional/compound operators. Canvas renders `[[Prototype]]` edges and the function's captured `[[Environment]]`. Lookup-path animation and prototype-pollution mode deferred to plan 5. _Completed 2026-05-08._
- [ ] **Plan 5** — errors & traceback: `throw`/`try`/`catch`, unwind events, animated error propagation on the canvas.

Plans v2/v3/v4 (post-MVP): async runtime (Promises, microtasks, `setTimeout`, `async`/`await`), generators, modules, share-via-URL, GIF export.

## Design references

- **Spec:** [`docs/superpowers/specs/2026-05-08-js-execution-visualizer-design.md`](./docs/superpowers/specs/2026-05-08-js-execution-visualizer-design.md)
- **Plan 1:** [`docs/superpowers/plans/2026-05-08-plan-1-engine-foundation.md`](./docs/superpowers/plans/2026-05-08-plan-1-engine-foundation.md)
- **Carry-overs:** [`docs/superpowers/plan-1-carry-over.md`](./docs/superpowers/plan-1-carry-over.md)

## Tech stack

| Concern              | Choice                          |
| -------------------- | ------------------------------- |
| Runtime / pkg mgr    | Node 20+, npm workspaces        |
| Language             | TypeScript (strict)             |
| Test runner          | Vitest                          |
| Parser               | Acorn                           |
| Immutability         | Immer                           |
| Lint / format        | ESLint + Prettier               |
| UI framework (plan 2)| React + Vite                    |
| State (plan 2)       | Reatom                          |
| Editor (plan 2)      | CodeMirror 6                    |
