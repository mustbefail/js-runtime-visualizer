# @js-runtime-visualizer/ui

The web UI shell. Vite + React 18 + Reatom + CodeMirror 6.

## Plan 2 scope

- App shell with editor, snapshot pane (call stack + heap + console), scrubber.
- Reatom atoms for session (`code`, `drillIn`, `scrubberSpeed`) persisted in `localStorage` via `withLocalStorage`.
- Engine atoms (`snapshots`, `finalValue`, `runError`) populated by the `runAction`.
- Derived atoms (`currentSnapshot`, `totalSteps`, `isAtStart`, `isAtEnd`).
- Editor highlights the current snapshot's line.
- Playwright smoke test exercises type → Run → snapshot.

## Plan 3 additions (canvas)

- SVG canvas replaces the textual snapshot pane.
- Stack frames render as draggable, collapsible nodes on the left; heap objects on the right.
- Reference edges (variable → object, property → object) render as bezier paths between right-edge of source and left-edge of target.
- Pan: drag the empty canvas. Zoom: mouse wheel (cursor-anchored).
- Node positions and collapsed state persist to `localStorage` (`jsrv:nodePositions`, `jsrv:collapsedIds`).
- Auto-arrange button (toolbar) resets positions to the default layout.
- CodeMirror is now code-split into a lazy chunk to reduce the main bundle.

## Plan 4 additions (prototypes + classes)

- Engine: prototype-aware member lookup, `new`, `Object.create`, `__proto__`, `class`/`extends`/`super`, `this` binding, `Function.prototype.call`, hoisting (`var` and function declarations), logical/conditional/compound operators, named function expression self-reference.
- Function HeapObjects now snapshot their captured bindings at allocation time — visible as the `[[Environment]]` block inside each function node.
- Canvas: solid violet `[[Prototype]]` edges between heap objects.
- Three new step-event kinds humanised in the snapshot pane: "Walked [[Prototype]] chain", "[[Prototype]] set", "this bound".

## Plan 5 additions (errors + traceback)

- Engine: `throw` / `try` / `catch` / `finally` with proper finally semantics on all completion modes (return, throw, fall-through). New event kinds `error`, `unwind-frame`, `catch`. Frame-leak fix in `invokeFunction` (carry-over from plan 1) — frames pop in a `finally` regardless of completion.
- UI: `TracebackPanel` overlays the canvas when the current snapshot is an error. Each row is clickable and jumps to that frame's `enter-frame` step. The top frame on the canvas gets a red border at the error step.

## Not yet (planned)

- Lookup-path animation along `[[Prototype]]` edges (engine emits `proto-walk`; UI animation pending).
- Dotted-grey `.prototype` edges (constructor → its `.prototype` object).
- Retained closure scope frames as separate canvas nodes (plan 4 ships inline `[[Environment]]` block).
- Async runtime panels (microtasks, macrotasks) — v2.

## Develop

```bash
npm install            # from repo root
npm run ui:dev         # http://localhost:5173
npm test               # vitest, includes UI atom tests
npm run e2e            # playwright smoke
```
