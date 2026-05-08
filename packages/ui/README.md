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

## Not yet (planned)

- Prototype chain visualisation, `class`/`extends`, prototype pollution mode (plan 4).
- Error traceback panel and animated unwinding (plan 5).
- Async runtime panels (microtasks, macrotasks) — v2.

## Develop

```bash
npm install            # from repo root
npm run ui:dev         # http://localhost:5173
npm test               # vitest, includes UI atom tests
npm run e2e            # playwright smoke
```
