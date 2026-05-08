# Plan 2 → Plan 3 carry-over

Items the final review of plan 2 surfaced. None blocked plan 2 merge; all should be wired into plan 3's task list at the appropriate point.

## For plan 3 (canvas visualisation)

1. **`nodePositions` persisted atom.** Extend `packages/ui/src/atoms/session.ts` with one more atom for canvas node positions, using the same `withLocalStorage({ key: persistKey('nodePositions'), version: STORAGE_VERSION })` pattern. Shape: `Map<string, { x: number; y: number }>` keyed by frame id or heap-object id.
2. **Replace `SnapshotPane` with `CanvasPane`.** The textual `CallStackView` and `HeapView` become reference implementations / a debug overlay. The canvas reads the same `currentSnapshotAtom`.
3. **Graph-layout library decision.** Either `dagre` or `elkjs` (both MIT — no GPL/AGPL flag) vs. hand-rolled positions. Pre-clear in plan-3's first task.
4. **Code-split CodeMirror.** Vite build currently emits an 808 kB JS chunk because CodeMirror is bundled with the rest. Either `React.lazy` the editor or use `build.rollupOptions.output.manualChunks` to split codemirror into its own chunk. Closes the chunk-size advisory.
5. **Standardise atom test scaffold.** `session.test.ts` uses `context.reset()` per-test, while `engine.test.ts` and `derived.test.ts` use `vi.resetModules()`. Converge on `vi.resetModules()` — it re-runs `withLocalStorage`'s eager IIFE, the stronger isolation property.

## Already addressed before merge (no action required)

- `isPlayingAtom` is now reset by `runAction` / `resetAction`. Auto-play state no longer lingers across runs.
- `.gitignore` now covers `.idea/`, `test-results/`, and `playwright-report/`.

## Carried forward from plan 1 (still open)

- Frame leak on non-`Return` throw in `evalCall` — moves to `finally` when plan 5 introduces user `try/catch`.
- `lookup` event kind reused for drill-in sub-steps — may get a dedicated `eval-step` kind later.
- Logical/conditional/compound operators, `this` binding, `var`/function-decl hoisting — plan 4.
