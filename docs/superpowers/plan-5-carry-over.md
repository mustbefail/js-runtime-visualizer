# Plan 5 → polish plan carry-over

Items the final review of plan 5 surfaced. None block plan-5 merge; track for the polish plan that ships before deploy.

## Spec §7 gap (Important)

1. **`runCode` discards snapshots on uncaught throw.** When a throw escapes all try/catch blocks, the generator-pump loop in `packages/engine/src/evaluator/index.ts` lets the `ThrowSignal` propagate out of `runCode`, the host re-throws, and `runAction` (`packages/ui/src/atoms/actions.ts`) sets `snapshotsAtom.set([])`. User sees the toolbar `⊗ error` indicator but no scrubber and no `TracebackPanel`. Spec §7 explicitly says: "Snapshots are recorded for all of these — the user can scrub through the unwind."

   **Fix sketch:** change `runCode` to return `{ snapshots, finalValue: JSValue | null, runtimeError?: { message, value } }` instead of throwing on uncaught throws. The engine has already emitted the `error` event and (after plan 5 task 5) the `unwind-frame` events for every popped frame, so the snapshots are valuable. `runAction` then surfaces `runtimeError` via `runErrorAtom` and uses the populated `snapshotsAtom` for the scrubber + TracebackPanel.

## Plan-5 internal nits (Minor)

2. **`tracebackAtom.enterStep` ambiguity on recursion.** `packages/ui/src/atoms/derived.ts` matches frames by `fnName` only. For `function rec(n){if(n<=0)throw 'x'; return rec(n-1);} rec(2);`, every traceback row resolves to the most recent enter-frame. Click-to-jump still lands somewhere sensible but isn't strictly correct. Fix: match on stack depth too — `stackAtK.length === arr.length - n` for frame index `n` from top.

3. **`invokeFunction` emits `leave-frame` for non-signal JS errors.** `evaluator/nodes.ts` finally block sees `completion === 'normal'` because we only set 'throw' for `ThrowSignal`. Internal engine bugs (e.g. a `TypeError` from host code) still pop the frame correctly, but emit a misleading `leave-frame` event. Set `completion = 'throw'` before re-raising in the catch's `else`-branch.

## Visual polish from spec §7.1 + §6.2

4. **Animated red arrow walking up frames during unwind.** Plan 5 ships a static red border on the top frame at the error step. Spec §7.1 calls for an animated red arrow.
5. **Catching frame turns green** when the catch resolves.
6. **Editor red squiggle on throw site** + dotted markers on call sites.
7. **Lookup-path animation** along `[[Prototype]]` edges (engine emits `proto-walk` from plan 4; UI animation pending).
8. **Dotted-grey `.prototype` edges** (constructor → its `.prototype` object).
9. **Retained closure scope frames** as separate canvas nodes (plan 4 ships inline `[[Environment]]` block).

## Test robustness

10. **e2e "throw caught" hard assertions** — fixed pre-merge via `data-testid="snapshot-pane"`. The pre-fix soft-pass should now be hard-pass; if it's still soft-passing on next CI run, diagnose via tracing.
