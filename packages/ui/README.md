# @js-runtime-visualizer/ui

The web UI shell. Vite + React 18 + Reatom + CodeMirror 6.

## Plan 2 scope

- App shell with editor, snapshot pane (call stack + heap + console), scrubber.
- Reatom atoms for session (`code`, `drillIn`, `scrubberSpeed`) persisted in `localStorage` via `withLocalStorage`.
- Engine atoms (`snapshots`, `finalValue`, `runError`) populated by the `runAction`.
- Derived atoms (`currentSnapshot`, `totalSteps`, `isAtStart`, `isAtEnd`).
- Editor highlights the current snapshot's line.
- Playwright smoke test exercises type → Run → snapshot.

## Not yet (planned)

- SVG canvas with draggable frames + heap nodes (plan 3).
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
