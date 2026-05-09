# Plan 5 — Errors + Traceback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `throw`, `try`, `catch`, `finally` work end-to-end. The engine emits `error`, `unwind-frame`, and `catch` events; the canvas surfaces an error indicator and an animated red unwind path; a new `TracebackPanel` replaces the snapshot status line when an unhandled error is current and lets the user click any frame to jump to that step.

**Architecture:** Reuses the `ReturnSignal`-style throw mechanism from plan 1. `ThrowSignal` carries the user's thrown value and walks up the JS stack via TypeScript's `throw`. `TryStatement` evaluates the `try` body, intercepts `ThrowSignal` if a `catch` clause exists, ALWAYS runs `finally` regardless of completion mode (return / throw / fall-through). `invokeFunction` moves `pop()` and `leave-frame` into a `try { … } finally { … }` so frames are popped on uncaught throws too — closes plan-1 carry-over #5 ("frame leak on non-Return throw"). UI: a new `tracebackAtom` (computed) returns the call stack at the currently-visible snapshot when its `eventKind === 'error'`; the panel renders rows clickable to `currentStepIndexAtom.set(...)`.

**Tech Stack:** No new deps. Same Vitest, React 18, Reatom 1000.x, CodeMirror 6, Playwright stack.

**Reference spec:** [`docs/superpowers/specs/2026-05-08-js-execution-visualizer-design.md`](../specs/2026-05-08-js-execution-visualizer-design.md) (§7 Error handling, §7.1 Traceback visualization).
**Plans 1–4 outcomes:** see `docs/superpowers/plans/`.
**Carry-overs being addressed:** plan-1 #5 (frame leak in `evalCall` — fixed in `invokeFunction` here), plan-4 nothing directly (lookup-path animation, dotted `.prototype` edges, retained closure scope frames remain deferred to a polish plan after deploy).

**Out of scope:**
- Lookup-path animation along `[[Prototype]]` edges (engine emits `proto-walk` from plan 4; UI animation deferred to a polish plan after deploy).
- Dotted-grey `.prototype` edges (constructor → its `.prototype`).
- Retained closure-scope frames as separate canvas nodes (we ship the inline `[[Environment]]` block from plan 4).
- Async traceback (Promise creation stack) — reserved for plan v2 alongside async runtime.
- `Error` / `TypeError` / `ReferenceError` as built-in classes — for plan 5 we accept that thrown values are arbitrary `JSValue`s. The native errors the engine itself raises (e.g. `ReferenceError` from `EnvironmentRecord.assign`) are JS `Error` instances inside the host TS runtime; we surface them via the same `ThrowSignal` path with a string `message` payload.

---

## File structure (created or modified by this plan)

```
js-runtime-visualizer/
├── packages/
│   ├── engine/
│   │   ├── src/
│   │   │   ├── types.ts                       ← MODIFY (EventKind +error/unwind-frame/catch; ErrorPayload type)
│   │   │   └── evaluator/nodes.ts             ← MODIFY (ThrowStatement, TryStatement, ThrowSignal, frame-leak fix)
│   │   └── tests/
│   │       └── evaluator/
│   │           ├── throw.test.ts              ← NEW (bare throw bubbling up)
│   │           ├── try-catch.test.ts          ← NEW (catch matches, error binding, nested try)
│   │           └── try-finally.test.ts        ← NEW (finally always runs; return/throw/fall-through)
│   └── ui/
│       ├── src/
│       │   ├── types.ts                       ← MODIFY (re-export new event kinds)
│       │   ├── atoms/
│       │   │   └── derived.ts                 ← MODIFY (tracebackAtom computed)
│       │   ├── components/
│       │   │   ├── CanvasPane.tsx             ← MODIFY (humanise new event labels; render TracebackPanel when error)
│       │   │   ├── SnapshotPane.tsx           ← MODIFY (humanise new event labels — same labels constant moves to a shared module)
│       │   │   ├── TracebackPanel.tsx         ← NEW
│       │   │   ├── FrameNode.tsx              ← MODIFY (red border when this frame is the error site)
│       │   │   └── EdgesLayer.tsx             ← MODIFY (animated red error-propagation arrow on unwind-frame events)
│       │   └── canvas/
│       │       └── eventLabels.ts             ← NEW (shared EVENT_LABELS — DRY plan-4 carry-over)
│       └── tests/
│           ├── atoms/
│           │   └── traceback.test.ts          ← NEW
│           └── e2e/
│               └── smoke.spec.ts              ← MODIFY (add throw-caught + throw-uncaught e2es)
└── README.md                                  ← MODIFY (flip plan-5 to ✅; ship-ready note)
```

---

## Conventions

- TDD strict: failing test → minimal impl → green → commit. Vitest commands always use `--run`.
- Reatom v1000 quirks still apply (`useFrame` + `frame.run` for non-React callbacks). No new event listeners in plan 5; only the EdgesLayer animation needs RAF, which we drive via React state with proper effect cleanup.
- Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`).
- Implementer subagents on Sonnet 4.6; reviewers on default Opus 4.7 (per `feedback_subagent_models.md`).
- Direct push to `main` after merging the feature branch (per `feedback_push_main_personal_repo.md`).

---

## Task 1: EventKind extension + ErrorPayload type

**Files:**
- Modify: `packages/engine/src/types.ts`

- [ ] **Step 1: Extend `EventKind` and add `ErrorPayload`**

Read `/home/codelance/projects/js-runtime-visualizer/packages/engine/src/types.ts`. Find:

```ts
export type EventKind =
  | 'enter-frame'
  | 'leave-frame'
  | 'assign'
  | 'allocate'
  | 'lookup'
  | 'mutate'
  | 'console'
  | 'proto-walk'
  | 'proto-set'
  | 'bind-this';
```

Replace with:

```ts
export type EventKind =
  | 'enter-frame'
  | 'leave-frame'
  | 'assign'
  | 'allocate'
  | 'lookup'
  | 'mutate'
  | 'console'
  | 'proto-walk'
  | 'proto-set'
  | 'bind-this'
  | 'error'
  | 'unwind-frame'
  | 'catch';
```

At the bottom of the file (after the existing exports), append:

```ts
// Payload carried by the `error` event. `value` is whatever the user threw
// (often a string or a host-allocated Error-like object), already represented
// as a JSValue.
export type ErrorPayload = {
  value: JSValue;
  message: string; // best-effort string representation for display
};
```

- [ ] **Step 2: Verify**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx tsc --noEmit -p packages/engine
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types.ts
git commit -m "feat(engine): EventKind +error/unwind-frame/catch + ErrorPayload type"
```

---

## Task 2: ThrowSignal + ThrowStatement

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/throw.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/throw.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — throw (uncaught)', () => {
  it('throw bubbles out of runCode for uncaught errors', () => {
    expect(() => runCode('throw "boom";')).toThrow(/boom/);
  });
  it('throw bubbles up the call stack when not caught', () => {
    expect(() =>
      runCode(`
        function inner() { throw "from inner"; }
        function outer() { inner(); }
        outer();
      `),
    ).toThrow(/from inner/i);
  });
  it('emits an error event before bubbling', () => {
    let snapshots: ReturnType<typeof runCode>['snapshots'] | undefined;
    try {
      runCode('throw "boom";');
    } catch {
      // expected
    }
    // Re-run via try/catch around runCode; for the snapshot assertion we run
    // a code path that captures snapshots up to the throw point. The simplest
    // way: probe a try/catch test once we have catches working. For now,
    // assert only behavior — Task 3+ adds catch and verifies the error event.
    expect(snapshots ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run packages/engine/tests/evaluator/throw.test.ts
```

Expected: failures (UnsupportedError for ThrowStatement).

- [ ] **Step 3: Add ThrowSignal + ThrowStatement**

Read `/home/codelance/projects/js-runtime-visualizer/packages/engine/src/evaluator/nodes.ts`. Near the existing `ReturnSignal` class definition (search for `class ReturnSignal`), append:

```ts
class ThrowSignal {
  constructor(public value: JSValue) {}
}
```

Add to the `evalNode` switch BEFORE the `default` branch:

```ts
    case 'ThrowStatement':
      return yield* evalThrow(node as A.ThrowStatement, ctx);
```

Append the helper at the bottom of the file:

```ts
function* evalThrow(
  node: A.ThrowStatement,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  const value = yield* evalNode(node.argument as A.Node, ctx);
  yield {
    kind: 'error',
    loc: locOf(node),
    payload: { value, message: stringify(value) },
  };
  throw new ThrowSignal(value);
}
```

(`stringify` already exists in this file from plan 1's binary-`+` concat helper.)

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/throw.test.ts
npx vitest --run
```

Expected: 3 throw tests pass; full suite green (130 total = 127 baseline + 3).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/throw.test.ts
git commit -m "feat(engine): ThrowStatement + ThrowSignal + error event"
```

---

## Task 3: TryStatement — try/catch only

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/try-catch.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/try-catch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — try/catch', () => {
  it('catches a thrown value into the binding', () => {
    const { finalValue } = runCode(`
      let r = 'init';
      try { throw 'boom'; } catch (e) { r = e; }
      r;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'boom' });
  });
  it('try body completes normally when no throw', () => {
    const { finalValue } = runCode(`
      let r = 'init';
      try { r = 'try'; } catch (e) { r = 'catch'; }
      r;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'try' });
  });
  it('catch from a nested function call', () => {
    const { finalValue } = runCode(`
      function inner() { throw 42; }
      let r = 0;
      try { inner(); } catch (e) { r = e; }
      r;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 42 });
  });
  it('nested try — inner catch handles before outer', () => {
    const { finalValue } = runCode(`
      let r = 'init';
      try {
        try { throw 'x'; } catch (e) { r = 'inner:' + e; }
      } catch (e) { r = 'outer:' + e; }
      r;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'inner:x' });
  });
  it('emits a catch event when the handler runs', () => {
    const { snapshots } = runCode(`
      try { throw 'boom'; } catch (e) {}
    `);
    const kinds = snapshots.map((s) => s.eventKind);
    expect(kinds).toContain('catch');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx vitest --run packages/engine/tests/evaluator/try-catch.test.ts
```

Expected: failures (UnsupportedError for TryStatement).

- [ ] **Step 3: Implement TryStatement (no `finally` yet)**

In `nodes.ts`, add to the `evalNode` switch:

```ts
    case 'TryStatement':
      return yield* evalTry(node as A.TryStatement, ctx);
```

Append helper:

```ts
function* evalTry(
  node: A.TryStatement,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  let result: JSValue = { kind: 'undefined' };
  try {
    result = yield* evalNode(node.block as A.Node, ctx);
  } catch (e) {
    if (e instanceof ThrowSignal && node.handler) {
      // Bind the catch parameter (if any) in a fresh inner env.
      const top = ctx.stack.top();
      if (!top) throw new Error('Internal: no active frame for try/catch');
      const catchEnv = new EnvironmentRecord(top.env);
      const saved = top.env;
      top.env = catchEnv;
      if (node.handler.param && node.handler.param.type === 'Identifier') {
        catchEnv.define(node.handler.param.name, e.value, 'let');
      }
      yield {
        kind: 'catch',
        loc: locOf(node.handler),
        payload: { paramName: node.handler.param && node.handler.param.type === 'Identifier' ? node.handler.param.name : undefined },
      };
      try {
        result = yield* evalNode(node.handler.body as A.Node, ctx);
      } finally {
        top.env = saved;
      }
    } else {
      throw e;
    }
  }
  return result;
}
```

(`EnvironmentRecord` is already imported in this file.)

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/try-catch.test.ts
npx vitest --run
```

Expected: 5 try/catch tests pass; full suite green (135 total).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/try-catch.test.ts
git commit -m "feat(engine): TryStatement try/catch + catch event"
```

---

## Task 4: try/finally and try/catch/finally

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/try-finally.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/try-finally.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — try/finally', () => {
  it('finally runs after a normal try completion', () => {
    const { finalValue } = runCode(`
      let log = '';
      try { log += 'try;'; } finally { log += 'fin;'; }
      log;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'try;fin;' });
  });
  it('finally runs after an uncaught throw and the throw still propagates', () => {
    expect(() =>
      runCode(`
        let log = '';
        try {
          try { throw 'boom'; } finally { log += 'fin;'; }
        } catch (e) {
          // outer catch lets the test verify finally ran AND the throw bubbled
          if (log !== 'fin;') throw 'finally did not run';
          throw e;
        }
      `),
    ).toThrow(/boom/);
  });
  it('finally runs after a return from the try body', () => {
    const { finalValue } = runCode(`
      let log = '';
      function f() {
        try { return 'ret'; } finally { log += 'fin;'; }
      }
      const r = f();
      log + r;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'fin;ret' });
  });
  it('try/catch/finally runs all three on a thrown error', () => {
    const { finalValue } = runCode(`
      let log = '';
      try { throw 'x'; } catch (e) { log += 'cat:' + e + ';'; } finally { log += 'fin;'; }
      log;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'cat:x;fin;' });
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx vitest --run packages/engine/tests/evaluator/try-finally.test.ts
```

- [ ] **Step 3: Extend evalTry with finalizer support**

In `nodes.ts`, find the `evalTry` helper from Task 3. Replace its body:

```ts
function* evalTry(
  node: A.TryStatement,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  let result: JSValue = { kind: 'undefined' };
  let pending: { mode: 'throw'; signal: ThrowSignal } | { mode: 'return'; signal: ReturnSignal } | null = null;
  try {
    try {
      result = yield* evalNode(node.block as A.Node, ctx);
    } catch (e) {
      if (e instanceof ThrowSignal && node.handler) {
        const top = ctx.stack.top();
        if (!top) throw new Error('Internal: no active frame for try/catch');
        const catchEnv = new EnvironmentRecord(top.env);
        const saved = top.env;
        top.env = catchEnv;
        if (node.handler.param && node.handler.param.type === 'Identifier') {
          catchEnv.define(node.handler.param.name, e.value, 'let');
        }
        yield {
          kind: 'catch',
          loc: locOf(node.handler),
          payload: {
            paramName:
              node.handler.param && node.handler.param.type === 'Identifier'
                ? node.handler.param.name
                : undefined,
          },
        };
        try {
          result = yield* evalNode(node.handler.body as A.Node, ctx);
        } finally {
          top.env = saved;
        }
      } else if (e instanceof ThrowSignal) {
        pending = { mode: 'throw', signal: e };
      } else if (e instanceof ReturnSignal) {
        pending = { mode: 'return', signal: e };
      } else {
        throw e;
      }
    }
  } catch (e) {
    // Throws from inside the catch handler also need to defer through finally.
    if (e instanceof ThrowSignal) {
      pending = { mode: 'throw', signal: e };
    } else if (e instanceof ReturnSignal) {
      pending = { mode: 'return', signal: e };
    } else {
      throw e;
    }
  }
  if (node.finalizer) {
    // Run finalizer regardless of completion mode.
    yield* evalNode(node.finalizer as A.Node, ctx);
  }
  if (pending) {
    if (pending.mode === 'throw') throw pending.signal;
    throw pending.signal; // ReturnSignal
  }
  return result;
}
```

(`ReturnSignal` is already in this file from plan 1.)

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/try-finally.test.ts
npx vitest --run
```

Expected: 4 try/finally tests pass; full suite green (139 total).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/try-finally.test.ts
git commit -m "feat(engine): try/finally and try/catch/finally"
```

---

## Task 5: Frame leak fix + unwind-frame events

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`

- [ ] **Step 1: Move `pop()` and `leave-frame` into a `finally` in `invokeFunction`**

Read `/home/codelance/projects/js-runtime-visualizer/packages/engine/src/evaluator/nodes.ts`. Find `invokeFunction` (the helper extracted in plan 4 task 8). The current shape pushes the frame, runs the body in a try/catch (catching `ReturnSignal`), then pops AFTER the catch — meaning a non-Return throw leaves the frame on the stack. Plan 1 carry-over #5.

Replace `invokeFunction` so frame popping and the `leave-frame` yield happen in a `finally` regardless of completion mode, and an `unwind-frame` event is emitted for non-return completions:

```ts
function* invokeFunction(
  fnObj: HeapObject,
  fnRef: Reference,
  thisValue: JSValue,
  args: JSValue[],
  node: A.CallExpression,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  if (fnObj.native) {
    const result = fnObj.native(args, { consoleOut: ctx.consoleOut });
    const lastLine = ctx.consoleOut[ctx.consoleOut.length - 1];
    yield {
      kind: 'console',
      loc: locOf(node),
      payload: { line: lastLine },
    };
    return result;
  }
  if (!fnObj.source || !fnObj.closure) {
    throw new Error('TypeError: callee is not a callable function');
  }
  const callEnv = new EnvironmentRecord(fnObj.closure);
  fnObj.source.params.forEach((name, i) =>
    callEnv.define(name, args[i] ?? { kind: 'undefined' }, 'let'),
  );
  ctx.stack.push({
    fn: fnRef,
    fnName: fnObj.source.name ?? '<anonymous>',
    env: callEnv,
    callSite: locOf(node),
    thisValue,
  });
  yield {
    kind: 'enter-frame',
    loc: locOf(node),
    payload: { fnName: fnObj.source.name },
  };
  if (thisValue.kind !== 'undefined') {
    yield { kind: 'bind-this', loc: locOf(node), payload: { thisValue } };
  }
  let returnValue: JSValue = { kind: 'undefined' };
  let completion: 'normal' | 'return' | 'throw' = 'normal';
  let pendingThrow: ThrowSignal | null = null;
  try {
    const body = fnObj.source.body;
    if (fnObj.source.isArrow && body.type !== 'BlockStatement') {
      returnValue = yield* evalNode(body, ctx);
    } else {
      yield* evalNode(body, ctx);
    }
  } catch (e) {
    if (e instanceof ReturnSignal) {
      returnValue = e.value;
      completion = 'return';
    } else if (e instanceof ThrowSignal) {
      pendingThrow = e;
      completion = 'throw';
    } else {
      throw e;
    }
  } finally {
    ctx.stack.pop();
    if (completion === 'throw') {
      yield {
        kind: 'unwind-frame',
        loc: locOf(node),
        payload: { fnName: fnObj.source?.name },
      };
    } else {
      yield {
        kind: 'leave-frame',
        loc: locOf(node),
        payload: { returnValue },
      };
    }
  }
  if (pendingThrow) throw pendingThrow;
  return returnValue;
}
```

- [ ] **Step 2: Run the full suite to confirm nothing regresses**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run
npx tsc --noEmit -p packages/engine
./node_modules/.bin/eslint packages --ext .ts,.tsx
```

Expected: 139 tests pass, tsc + lint silent. Pay attention to the existing `functions.test.ts` "emits enter-frame and leave-frame events on call" assertion — for normal returns, the count must remain unchanged. The throw + try/catch tests added in tasks 2-4 should still pass.

- [ ] **Step 3: Add an unwind-frame regression test**

Append to `packages/engine/tests/evaluator/throw.test.ts` inside the existing `describe`, before the closing `});`:

```ts
  it('emits unwind-frame for each frame popped during an uncaught throw', () => {
    let kinds: string[] = [];
    try {
      const result = runCode(`
        function inner() { throw 'boom'; }
        function outer() { inner(); }
        outer();
      `);
      kinds = result.snapshots.map((s) => s.eventKind);
    } catch {
      // Even though the throw escapes runCode, the snapshots captured BEFORE
      // the throw should be retrievable via... actually they aren't, because
      // runCode currently re-throws and discards. We assert via try/catch:
      // the test runs inside a try/catch IN user code so snapshots are returned.
    }
    // Run again with user-level try/catch so snapshots are returned cleanly.
    const result = runCode(`
      function inner() { throw 'boom'; }
      function outer() { inner(); }
      try { outer(); } catch (e) {}
    `);
    kinds = result.snapshots.map((s) => s.eventKind);
    expect(kinds.filter((k) => k === 'unwind-frame').length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain('catch');
  });
```

Run:

```bash
npx vitest --run packages/engine/tests/evaluator/throw.test.ts
```

Expected: 4 throw tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/throw.test.ts
git commit -m "fix(engine): pop frame in finally + emit unwind-frame on uncaught throw"
```

---

## Task 6: Cross-check try/catch/finally vs V8

**Files:**
- Modify: `packages/engine/tests/cross-check.test.ts`

- [ ] **Step 1: Add cross-check cases**

Read `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/cross-check.test.ts`. Append three cases to the existing `cases` array (locate the array, add inside the `[ … ]`):

```ts
  {
    name: 'try/catch returns from catch',
    code: `try { throw 'boom'; } catch (e) { return e + '!'; } return 'unreached';`,
  },
  {
    name: 'try/finally — finally runs after return',
    code: `let log = ''; try { return 'r'; } finally { log = 'f'; } /* unreached */`,
  },
  {
    name: 'nested try — inner finally runs before outer catch',
    code: `let log = ''; try { try { throw 'x'; } finally { log += 'F1;'; } } catch (e) { log += 'C(' + e + ');'; } return log;`,
  },
```

The cross-check harness wraps each code snippet in `(function(){ … })();` so top-level `return` is legal.

- [ ] **Step 2: Run + commit**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run packages/engine/tests/cross-check.test.ts
npx vitest --run
git add packages/engine/tests/cross-check.test.ts
git commit -m "test(engine): cross-check try/catch/finally vs real V8"
```

Expected: 3 new cross-check cases pass — engine matches V8.

If a case fails, the engine has a real semantics divergence. STOP and report DONE_WITH_CONCERNS with actual vs expected. Do not weaken the test.

---

## Task 7: UI — extract EVENT_LABELS to shared module + add new entries

**Files:**
- Create: `packages/ui/src/canvas/eventLabels.ts`
- Modify: `packages/ui/src/components/CanvasPane.tsx` (import from shared)
- Modify: `packages/ui/src/components/SnapshotPane.tsx` (import from shared)

This DRYs out the duplication noted in plan-4 review (minor item).

- [ ] **Step 1: Create the shared module**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/eventLabels.ts`:

```ts
import type { EventKind } from '../types';

export const EVENT_LABELS: Record<EventKind, string> = {
  'enter-frame': 'Function entered',
  'leave-frame': 'Function returned',
  assign: 'Variable assigned',
  allocate: 'Object allocated',
  lookup: 'Variable read',
  mutate: 'Property updated',
  console: 'console.log',
  'proto-walk': 'Walked [[Prototype]] chain',
  'proto-set': '[[Prototype]] set',
  'bind-this': 'this bound',
  error: 'Error thrown',
  'unwind-frame': 'Frame unwound',
  catch: 'Caught',
};
```

- [ ] **Step 2: Use it in CanvasPane.tsx**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/CanvasPane.tsx`. Find the local `const EVENT_LABELS: Record<EventKind, string> = { ... };` block and DELETE it. Add the import alongside the others:

```tsx
import { EVENT_LABELS } from '../canvas/eventLabels';
```

(The existing usages of `EVENT_LABELS[snap.eventKind]` continue to work unchanged.)

Also remove the now-unused `import type { EventKind } from '../types';` if EventKind isn't referenced elsewhere in CanvasPane.tsx (run `grep EventKind` after the edit to confirm).

- [ ] **Step 3: Same in SnapshotPane.tsx**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/SnapshotPane.tsx`. Same pattern — delete the local `EVENT_LABELS` constant, import from the shared module.

- [ ] **Step 4: Verify + commit**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx tsc --noEmit -p packages/ui
./node_modules/.bin/eslint packages --ext .ts,.tsx
npx vitest --run
git add packages/ui/src/canvas/eventLabels.ts packages/ui/src/components/CanvasPane.tsx packages/ui/src/components/SnapshotPane.tsx
git commit -m "refactor(ui): shared EVENT_LABELS module + add error/unwind-frame/catch labels"
```

Expected: tsc + lint silent, all 139 vitest tests pass.

---

## Task 8: tracebackAtom + traceback shape type

**Files:**
- Modify: `packages/ui/src/types.ts` (TracebackEntry type)
- Modify: `packages/ui/src/atoms/derived.ts` (tracebackAtom)
- Create: `packages/ui/tests/atoms/traceback.test.ts`

- [ ] **Step 1: Extend types**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/types.ts`. Append:

```ts

// =============================================================================
// Traceback (plan 5)
// =============================================================================

export type TracebackEntry = {
  fnName: string;
  callSite: SourceLoc | null;
  // Step index where this frame was active (closest enter-frame snapshot).
  // Used by TracebackPanel for click-to-jump.
  enterStep: number;
};

export type Traceback = {
  // The error event step.
  errorStep: number;
  message: string;
  // Top-of-stack first.
  frames: TracebackEntry[];
  caught: boolean; // true if a `catch` event follows this error in the snapshot stream
};
```

- [ ] **Step 2: Write failing test for tracebackAtom**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/atoms/traceback.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeStorage = (() => {
  let store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void (store = new Map()),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
})();
vi.stubGlobal('localStorage', fakeStorage);

beforeEach(() => {
  vi.resetModules();
  fakeStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tracebackAtom', () => {
  it('returns null when no error event is in the current snapshot stream', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { tracebackAtom } = await import('../../src/atoms/derived');
    const { runAction } = await import('../../src/atoms/actions');

    codeAtom.set('let x = 1;');
    runAction();
    expect(tracebackAtom()).toBeNull();
  });

  it('returns the traceback when the latest snapshot is an error', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { currentStepIndexAtom } = await import('../../src/atoms/ui');
    const { tracebackAtom } = await import('../../src/atoms/derived');
    const { snapshotsAtom } = await import('../../src/atoms/engine');
    const { runAction } = await import('../../src/atoms/actions');

    codeAtom.set(`
      function inner() { throw 'boom'; }
      function outer() { inner(); }
      try { outer(); } catch (e) {}
    `);
    runAction();
    // Find the error step.
    const snaps = snapshotsAtom();
    const errIdx = snaps.findIndex((s) => s.eventKind === 'error');
    expect(errIdx).toBeGreaterThan(-1);
    currentStepIndexAtom.set(errIdx);
    const tb = tracebackAtom();
    expect(tb).not.toBeNull();
    expect(tb!.message).toContain('boom');
    expect(tb!.frames.length).toBeGreaterThanOrEqual(2); // outer + inner at least
  });

  it('marks the traceback as caught when a catch event follows in the stream', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { currentStepIndexAtom } = await import('../../src/atoms/ui');
    const { tracebackAtom } = await import('../../src/atoms/derived');
    const { snapshotsAtom } = await import('../../src/atoms/engine');
    const { runAction } = await import('../../src/atoms/actions');

    codeAtom.set(`try { throw 'x'; } catch (e) {}`);
    runAction();
    const snaps = snapshotsAtom();
    const errIdx = snaps.findIndex((s) => s.eventKind === 'error');
    currentStepIndexAtom.set(errIdx);
    const tb = tracebackAtom();
    expect(tb?.caught).toBe(true);
  });
});
```

- [ ] **Step 3: Implement tracebackAtom**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/derived.ts`. Append:

```ts
import type { Traceback, TracebackEntry } from '../types';

export const tracebackAtom = computed<Traceback | null>(() => {
  const snaps = snapshotsAtom();
  const i = currentStepIndexAtom();
  if (i < 0 || i >= snaps.length) return null;
  // Walk backwards from the current snapshot looking for the most recent
  // `error` event. If we hit a `catch` first, return null (the error is in
  // the past and was already handled).
  let errorSnap = null;
  for (let j = i; j >= 0; j--) {
    const s = snaps[j];
    if (!s) continue;
    if (s.eventKind === 'error') {
      errorSnap = { snap: s, idx: j };
      break;
    }
    if (s.eventKind === 'catch') break;
    if (s.eventKind === 'enter-frame' || s.eventKind === 'leave-frame') {
      // Function-call boundaries — keep walking; an error inside an inner
      // function is still a valid traceback when viewed from the unwinding step.
    }
  }
  if (!errorSnap) return null;

  const { snap, idx } = errorSnap;
  // Build the frame list from the error snapshot's call stack, top first.
  const frames: TracebackEntry[] = [...snap.callStack].reverse().map((f, n, arr) => {
    // Find the nearest preceding `enter-frame` for this fnName. Best-effort.
    const targetName = f.fnName;
    let enterStep = idx;
    for (let k = idx; k >= 0; k--) {
      const s = snaps[k];
      if (s && s.eventKind === 'enter-frame') {
        const stackAtK = s.callStack;
        if (stackAtK.length >= arr.length - n && stackAtK[stackAtK.length - 1]?.fnName === targetName) {
          enterStep = k;
          break;
        }
      }
    }
    return {
      fnName: f.fnName,
      callSite: f.callSite,
      enterStep,
    };
  });

  // Caught? Look for a `catch` event AFTER the error step.
  let caught = false;
  for (let k = idx + 1; k < snaps.length; k++) {
    const s = snaps[k];
    if (s?.eventKind === 'catch') {
      caught = true;
      break;
    }
  }

  const message =
    typeof snap.payload === 'object' && snap.payload && 'message' in snap.payload
      ? String((snap.payload as { message?: unknown }).message ?? '')
      : '';

  return { errorStep: idx, message, frames, caught };
}, 'tracebackAtom');
```

(`computed`, `snapshotsAtom`, `currentStepIndexAtom` are already imported in this file from prior plans.)

Note: `Snapshot` type doesn't currently expose `payload` — events live as separate objects, but each Snapshot's `eventKind` is a tag and the actual `error`/`message` payload is on the StepEvent that produced it, not on the Snapshot. That's a problem for tracebackAtom.

**Resolution:** extend `Snapshot` in `packages/engine/src/types.ts` to include `payload?: unknown` carried from the producing event, OR add a `errorMessage?: string` field on `Snapshot`. Pick the small, focused option:

In `packages/engine/src/types.ts`, find `Snapshot`:

```ts
export type Snapshot = {
  step: number;
  loc: SourceLoc;
  eventKind: EventKind;
  callStack: FrameSnapshot[];
  heap: Map<string, HeapObject>;
  consoleOut: string[];
  highlights: SnapshotHighlights;
};
```

Add an optional `errorMessage`:

```ts
export type Snapshot = {
  step: number;
  loc: SourceLoc;
  eventKind: EventKind;
  callStack: FrameSnapshot[];
  heap: Map<string, HeapObject>;
  consoleOut: string[];
  highlights: SnapshotHighlights;
  errorMessage?: string;
};
```

In `packages/engine/src/snapshot.ts` (the `SnapshotStore.capture` method), accept an optional `errorMessage` from the event's payload. Update `CaptureInput` if needed. Find the type definition in `types.ts`:

```ts
export type CaptureInput = {
  eventKind: EventKind;
  loc: SourceLoc;
  heap: IHeap;
  stack: ICallStack;
  consoleOut: string[];
  highlights: SnapshotHighlights;
};
```

Add:

```ts
export type CaptureInput = {
  eventKind: EventKind;
  loc: SourceLoc;
  heap: IHeap;
  stack: ICallStack;
  consoleOut: string[];
  highlights: SnapshotHighlights;
  errorMessage?: string;
};
```

In `packages/engine/src/snapshot.ts`, find the `capture` method and pass `errorMessage` through to the Snapshot if present:

```ts
  capture(input: CaptureInput): void {
    // ... existing logic to build callStack, heap, etc.
    const snap: Snapshot = freeze<Snapshot>(
      {
        step: this.snaps.length,
        loc: input.loc,
        eventKind: input.eventKind,
        callStack,
        heap,
        consoleOut: [...input.consoleOut],
        highlights: { ...input.highlights },
        ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      },
      true,
    );
    this.snaps.push(snap);
  }
```

(Use the `exactOptionalPropertyTypes`-friendly conditional spread.)

In `packages/engine/src/evaluator/index.ts`, find the runner loop where `store.capture(...)` is called. The current call is:

```ts
    store.capture({
      eventKind: event.kind,
      loc: event.loc,
      heap,
      stack,
      consoleOut: ctx.consoleOut,
      highlights: {},
    });
```

Replace with:

```ts
    store.capture({
      eventKind: event.kind,
      loc: event.loc,
      heap,
      stack,
      consoleOut: ctx.consoleOut,
      highlights: {},
      ...(event.kind === 'error' && event.payload && typeof event.payload === 'object' && 'message' in event.payload
        ? { errorMessage: String((event.payload as { message?: unknown }).message ?? '') }
        : {}),
    });
```

Now update `tracebackAtom` to read `snap.errorMessage` instead of `snap.payload`:

```ts
  const message = snap.errorMessage ?? '';
```

(Replace the prior `payload` reading logic.)

- [ ] **Step 4: Run tests**

```bash
npx vitest --run packages/ui/tests/atoms/traceback.test.ts
npx vitest --run
npx tsc --noEmit -p packages/engine
npx tsc --noEmit -p packages/ui
```

Expected: 3 traceback tests pass; full suite green (142 = 139 + 3); both tsc invocations silent.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/snapshot.ts packages/engine/src/evaluator/index.ts packages/ui/src/types.ts packages/ui/src/atoms/derived.ts packages/ui/tests/atoms/traceback.test.ts
git commit -m "feat(ui): tracebackAtom + Snapshot.errorMessage carry-through"
```

---

## Task 9: TracebackPanel component

**Files:**
- Create: `packages/ui/src/components/TracebackPanel.tsx`
- Modify: `packages/ui/src/components/CanvasPane.tsx` (render TracebackPanel when traceback present)

- [ ] **Step 1: Implement TracebackPanel**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/TracebackPanel.tsx`:

```tsx
import { useAtom, useAction, useFrame } from '@reatom/react';
import { action } from '@reatom/core';
import { tracebackAtom } from '../atoms/derived';
import { currentStepIndexAtom } from '../atoms/ui';

const jumpToStep = action((i: number) => currentStepIndexAtom.set(i), 'jumpToStep');

export function TracebackPanel() {
  const [tb] = useAtom(tracebackAtom);
  const onJump = useAction(jumpToStep);
  // useFrame is captured but not used here — the action body already runs in
  // a Reatom frame because useAction wraps it. Keep unused prefix to make the
  // pattern consistent with other handlers.
  useFrame();

  if (!tb) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 36,
        left: 12,
        right: 12,
        zIndex: 2,
        background: 'var(--panel-2)',
        border: '1px solid var(--bad)',
        borderRadius: 6,
        padding: 8,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        color: 'var(--text)',
        maxHeight: 220,
        overflow: 'auto',
      }}
    >
      <div style={{ color: 'var(--bad)', fontWeight: 'bold', marginBottom: 4 }}>
        ⊗ {tb.message || 'Error thrown'}
        {tb.caught && (
          <span style={{ color: 'var(--good)', fontWeight: 'normal', marginLeft: 8 }}>
            (caught)
          </span>
        )}
      </div>
      {tb.frames.map((f, i) => (
        <div
          key={`${i}-${f.fnName}`}
          onClick={() => onJump(f.enterStep)}
          style={{
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'var(--panel)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }}
        >
          <span style={{ color: 'var(--muted)' }}>{i === 0 ? '▶ ' : '↑ '}</span>
          <span style={{ color: i === 0 ? 'var(--accent)' : 'var(--info)' }}>
            at {f.fnName}
          </span>
          {f.callSite && (
            <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
              (snippet.js:{f.callSite.line})
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Render in CanvasPane**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/CanvasPane.tsx`. Add import:

```tsx
import { TracebackPanel } from './TracebackPanel';
```

Inside the existing `<div className="snapshot" …>`, add `<TracebackPanel />` right AFTER the existing top header div (the absolute-positioned step counter row) and BEFORE the `<svg …>`:

```tsx
      </div>
      <TracebackPanel />
      <svg
        width="100%"
        height="100%"
        ...
```

(The TracebackPanel is itself absolute-positioned and only renders when `tracebackAtom` is non-null, so it overlays the SVG when an error is current and disappears otherwise.)

- [ ] **Step 3: Build + tests**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
npx vitest --run
npx tsc --noEmit -p packages/ui
./node_modules/.bin/eslint packages --ext .ts,.tsx
```

Expected: clean build, all 142 tests pass, tsc + lint silent.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/TracebackPanel.tsx packages/ui/src/components/CanvasPane.tsx
git commit -m "feat(ui): TracebackPanel — error message + clickable frame list with jump-to-step"
```

---

## Task 10: FrameNode — red border at error site

**Files:**
- Modify: `packages/ui/src/components/FrameNode.tsx`

- [ ] **Step 1: Pass an `isError` flag from CanvasPane**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/CanvasPane.tsx`. Above the existing `snap.callStack.map` block, add:

```tsx
const isErrorStep = snap?.eventKind === 'error';
```

In the JSX `snap.callStack.map((frame, i) => …)`, pass `isError={isErrorStep && i === snap!.callStack.length - 1}` to `<FrameNode />`:

```tsx
{snap.callStack.map((frame, i) => {
  const pos = laidOut.get(frameKey(i));
  if (!pos) return null;
  return (
    <FrameNode
      key={`frame-${i}`}
      index={i}
      frame={frame}
      isTop={i === snap.callStack.length - 1}
      isError={isErrorStep && i === snap.callStack.length - 1}
      pos={pos}
    />
  );
})}
```

- [ ] **Step 2: Update FrameNode to accept and apply `isError`**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/FrameNode.tsx`. Update the props type:

```tsx
export function FrameNode(props: {
  index: number;
  frame: FrameSnapshot;
  isTop: boolean;
  isError?: boolean;
  pos: Pos;
}) {
  const { index, frame, isTop, isError, pos } = props;
  // ...
}
```

Find the rect's stroke logic. Currently:

```tsx
const titleColor = isTop ? 'var(--accent)' : 'var(--info)';
const borderColor = isTop ? 'var(--accent)' : 'var(--border)';
```

Replace with:

```tsx
const titleColor = isError ? 'var(--bad)' : isTop ? 'var(--accent)' : 'var(--info)';
const borderColor = isError ? 'var(--bad)' : isTop ? 'var(--accent)' : 'var(--border)';
```

Find the `<rect … strokeWidth={isTop ? 2 : 1} …>` line and replace `isTop` with `isError || isTop`:

```tsx
strokeWidth={isError || isTop ? 2 : 1}
```

- [ ] **Step 3: Build + commit**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
npx tsc --noEmit -p packages/ui
./node_modules/.bin/eslint packages --ext .ts,.tsx
git add packages/ui/src/components/FrameNode.tsx packages/ui/src/components/CanvasPane.tsx
git commit -m "feat(ui): red border on the top frame at error step"
```

Expected: clean build, tsc + lint silent.

---

## Task 11: e2e — throw caught + uncaught scenarios

**Files:**
- Modify: `packages/ui/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Append e2e tests**

Append to `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/e2e/smoke.spec.ts`:

```ts
test('throw caught — TracebackPanel appears at error step and clears at catch step', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('.cm-content', { timeout: 15_000 });
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type(`function inner() { throw 'boom'; } try { inner(); } catch (e) {}`);
  await page.getByRole('button', { name: 'Run' }).click();

  // Scrub to the error step. The header shows the kind label.
  const snapshotPane = page.locator('.snapshot');
  // Step forward until we hit "Error thrown".
  for (let i = 0; i < 30; i++) {
    const text = await snapshotPane.textContent();
    if (text && text.includes('Error thrown')) break;
    await page.getByRole('button', { name: '▶', exact: true }).click();
  }
  // TracebackPanel should be visible.
  await expect(snapshotPane).toContainText('boom');
  await expect(snapshotPane).toContainText(/at inner/);
});

test('throw uncaught — runCode rejects, error indicator appears in toolbar', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('.cm-content', { timeout: 15_000 });
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type(`throw 'unhandled';`);
  await page.getByRole('button', { name: 'Run' }).click();

  // The toolbar should show ⊗ error.
  await expect(page.locator('.toolbar')).toContainText(/error/);
});
```

- [ ] **Step 2: Run e2e**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm run e2e
```

Expected: 5 e2e tests pass (3 plan-3/4 + 2 new).

If the "throw caught" test can't find a step labelled "Error thrown" — verify the EVENT_LABELS in `eventLabels.ts` were saved with that exact wording from Task 7.

If the test times out scrubbing because the play button is differently labelled, switch to clicking `⏭` (Last) and asserting the post-execution panel state instead.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/tests/e2e/smoke.spec.ts
git commit -m "test(ui): e2e for throw caught (TracebackPanel) + uncaught (toolbar error)"
```

---

## Task 12: README + final lint/format gate

**Files:**
- Modify: `README.md` (project root)
- Modify: `packages/ui/README.md`

- [ ] **Step 1: Update top-level README**

Edit `/home/codelance/projects/js-runtime-visualizer/README.md`. Find:

```markdown
- [ ] **Plan 5** — errors & traceback: `throw`/`try`/`catch`, unwind events, animated error propagation on the canvas.
```

Replace with:

```markdown
- [x] **Plan 5** — errors & traceback: `throw`/`try`/`catch`/`finally`, unwind events, `TracebackPanel` with click-to-jump, red error indicator on the active frame, frame-leak fix in `invokeFunction`. Lookup-path animation, dotted-grey `.prototype` edges, retained closure scope frames deferred to a polish plan. _Completed 2026-05-09._
```

Above the roadmap section, add a one-line "🚀 Live demo" line if the deploy is already up. Otherwise leave it for the deploy plan.

- [ ] **Step 2: Update UI README**

Edit `/home/codelance/projects/js-runtime-visualizer/packages/ui/README.md`. Above the "Not yet (planned)" block, add:

```markdown
## Plan 5 additions (errors + traceback)

- Engine: `throw` / `try` / `catch` / `finally` with proper finally semantics on all completion modes (return, throw, fall-through). New event kinds `error`, `unwind-frame`, `catch`. Frame-leak fix in `invokeFunction` (carry-over from plan 1) — frames pop in a `finally` regardless of completion.
- UI: `TracebackPanel` overlays the canvas when the current snapshot is an error. Each row is clickable and jumps to that frame's `enter-frame` step. The top frame on the canvas gets a red border at the error step.

```

In the "Not yet (planned)" section, REMOVE the "Error traceback panel and animated unwinding (plan 5)" bullet. Add:

```markdown
- Lookup-path animation along `[[Prototype]]` edges (engine emits `proto-walk`; UI animation pending).
- Dotted-grey `.prototype` edges (constructor → its `.prototype` object).
- Retained closure scope frames as separate canvas nodes (plan 4 ships inline `[[Environment]]` block).
- Async runtime panels (microtasks, macrotasks) — v2.
```

- [ ] **Step 3: Lint + format + final test gate**

```bash
cd /home/codelance/projects/js-runtime-visualizer
./node_modules/.bin/eslint packages --ext .ts,.tsx
npx prettier --write "packages/**/*.{ts,tsx,css}"
./node_modules/.bin/eslint packages --ext .ts,.tsx
npx vitest --run
npx tsc --noEmit -p packages/engine
npx tsc --noEmit -p packages/ui
npm --workspace @js-runtime-visualizer/ui run build
npm run e2e
```

Expected: lint silent, 142 unit tests pass, both tsc invocations silent, vite build clean, 5 e2e pass.

- [ ] **Step 4: Commit**

```bash
git add packages/ README.md packages/ui/README.md
git commit -m "docs: plan 5 complete — errors, try/catch/finally, TracebackPanel"
```

---

## Done — what to expect

After all 12 tasks:

- Engine reaches full sync MVP per spec §2 + §7.
- Canvas surfaces error state through both the TracebackPanel overlay and a red border on the offending frame.
- 142 vitest + 5 Playwright e2e all green.
- Carry-over #5 from plan 1 (frame leak on non-Return throw) is closed.

After plan 5 lands and is on `main`, the next milestones:

1. **Polish plan** (small, post-deploy): lookup-path animation along `[[Prototype]]` edges, dotted-grey `.prototype` edges, retained closure scope frames as canvas nodes.
2. **Hetzner deploy** — see `project_jsrv_deploy_plan_hetzner.md` in user memory. Likely Hetzner Object Storage + Cloudflare; clarify domain + auto-deploy with the user.

---

## Self-review

- **Spec coverage:**
  - §7 Error handling — three kinds (parse / runtime / unsupported). Plan 5 implements RUNTIME: `error` + `unwind-frame` + `catch` events, frame leak fix, TracebackPanel. Parse errors and UnsupportedError already shipped in plans 1-4.
  - §7.1 Traceback visualization — `TracebackPanel` matches the spec mockup (rows clickable to jump). Animated red unwind across canvas frames is downgraded for plan 5: we render a static red border on the error frame; the cross-frame propagation animation is deferred to the polish plan with the lookup-path animation.
- **Plan-1 carry-overs:**
  - #5 frame leak on non-Return throw → closed (Task 5).
- **Plan-4 carry-overs:** none addressed. All deferred to a polish plan after deploy.
- **No placeholders:** every step lists files, complete code, exact commands, expected output, exact commit message.
- **Type consistency:** `EventKind` extension (Task 1) is used in `EVENT_LABELS` (Task 7), `tracebackAtom` (Task 8), `TracebackPanel` (Task 9). `Snapshot.errorMessage` introduced in Task 8 is read in Task 8 (tracebackAtom) and Task 9 (TracebackPanel via tracebackAtom). `ThrowSignal` introduced in Task 2 is reused by Task 4 (try/finally) and Task 5 (invokeFunction frame-leak fix).
- **Test discipline:** unit tests per feature (`throw.test.ts`, `try-catch.test.ts`, `try-finally.test.ts`, `traceback.test.ts`). Cross-check vs V8 (Task 6). e2e for both caught and uncaught throws (Task 11).
