# Plan 1 → Plan 2 carry-over

Items the final review of plan 1 surfaced that need explicit handling in subsequent plans. None blocks the merge of plan 1; all should be wired into the next plan's task list at the appropriate point.

## For plan 2 (UI shell + textual view)

1. **Structural sharing in SnapshotStore.** Spec §5.2 promises that snapshots share structure via Immer (`produce(prev, draft => …)`), giving memory cost O(mutations), not O(steps × heap size). Plan-1 implementation freezes a fresh deep-copy per step. Memory cost on long traces will hit the spec's `MAX_STEPS = 10_000` ceiling fast. Plan 2 task list should include either: (a) refactor `SnapshotStore.capture` to call `produce` against the previous snapshot, or (b) wire the `MAX_STEPS` ceiling with a user-visible warning and accept the larger memory bill.
2. **Public API exports** — `SnapshotHighlights` and `BindingKind` were added to `packages/engine/src/index.ts` after final review. Confirm during plan 2 that the UI imports them from the package root, not from `./types` directly.
3. **`lookup` event overload for drill-in.** Plan-1 yields three `lookup` events with `payload.phase` for binary sub-expressions. Plan 2 UI needs to either render those distinctly via `payload.phase`, or wait until a dedicated `eval-step` event kind lands later.

## For plan 4 (prototypes, classes, missing operators)

4. Add support for: logical `&&` `||` `??`, conditional `?:`, compound assignment (`+=` etc.), named function expression self-reference, `this` binding, `var` and `function` declaration hoisting.

## For plan 5 (errors + traceback)

5. **Frame leak on non-Return throw in `evalCall`.** `packages/engine/src/evaluator/nodes.ts` — currently `try { body } catch (ReturnSignal) ... else throw`. When user `throw` lands, an uncaught throw must still pop the frame and emit `leave-frame` (with `unwound: true` payload). Move `pop()` and the `leave-frame` yield into a `finally`, gating the payload on completion mode.
