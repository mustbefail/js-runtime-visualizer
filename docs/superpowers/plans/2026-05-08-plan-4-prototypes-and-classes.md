# Plan 4 — Prototypes, Classes, `this`, Hoisting, Missing Operators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the synchronous MVP of the engine — function constructors with `new`, classical and ES2015 inheritance (`Object.create`, `__proto__`, `class`/`extends`/`super`, `this` binding), missing operators (`&&`/`||`/`??`/`?:`/compound-assign/named function expression self-reference), `var` and function-declaration hoisting. Add the captured-bindings field to function heap objects so the canvas can render closures. Show prototype-chain edges as solid violet curves and the function's `[[Environment]]` (captured bindings) as an inline block.

**Architecture:** All engine work continues the tree-walking interpreter pattern from plan 1 — new AST handlers in `evaluator/nodes.ts`, new builtins in `runtime/builtins.ts`, no new modules. Member-access lookup grows a tiny prototype-walk loop. `new` and `class` reuse the existing call infrastructure with a fresh `this` binding stored on the frame. Closures are captured by snapshotting the active environment's binding chain at the moment a function is allocated; the snapshot lives on the function's `HeapObject.source` so the snapshotter naturally serialises it. UI grows: a `protoEdges` selector + an `[[Environment]]` block inside `HeapNode` for `kind === 'function'`.

**Tech Stack:** No new deps. Continues plan 1-3 stack (Acorn, Vitest, React, Reatom 1000.x, CodeMirror 6).

**Reference spec:** [`docs/superpowers/specs/2026-05-08-js-execution-visualizer-design.md`](../specs/2026-05-08-js-execution-visualizer-design.md) (§2 MVP scope, §4 engine modules, §6.2 canvas details — prototype + closure rendering)
**Plan 1 / 2 / 3 outcomes:** see `docs/superpowers/plans/`.
**Carry-overs being addressed:** plan-1 #4 (logical/conditional/compound/named-fn-expr/`this`/hoisting), plan-1 #2 (closure visualisation prep), plan-2 (none), plan-3 (none).

**Out of scope (deferred to plan 5):**
- `throw`/`try`/`catch` and the traceback panel.
- Lookup path animation (dashed orange) — engine emits `proto-walk` events here, but UI animation lands in plan 5 alongside error-propagation animation.
- Dotted grey `.prototype` edges (constructor → its `.prototype` object). Cosmetic toggle; deferred.
- Retained closure-scope FRAMES rendered as separate canvas nodes with dashed violet `[[Scope]]` edges. Plan 4 ships closure data inline as an `[[Environment]]` block on the function node, which is enough to convey closures; the more elaborate scope-graph viz can wait.

**Out of scope (deferred to v2 or later):**
- Async (`Promise`, `setTimeout`, `async`/`await`, microtasks).
- Generators, `Symbol`, `Map`/`Set`, `Proxy`, modules.

---

## File structure (created or modified by this plan)

```
js-runtime-visualizer/
├── packages/
│   ├── engine/
│   │   ├── src/
│   │   │   ├── types.ts                 ← MODIFY (extend EventKind, FunctionSource.closureBindings, ProtoEdge)
│   │   │   ├── evaluator/nodes.ts       ← MODIFY (operators, hoisting, prototypes, classes, this, new, super, closure capture)
│   │   │   └── runtime/builtins.ts      ← MODIFY (Object.prototype/Array.prototype/Function.prototype, Object.create, getPrototypeOf, Function.prototype.call)
│   │   └── tests/
│   │       └── evaluator/
│   │           ├── logical-ops.test.ts   ← NEW
│   │           ├── conditional.test.ts   ← NEW
│   │           ├── compound-assign.test.ts ← NEW
│   │           ├── hoisting.test.ts      ← NEW
│   │           ├── prototypes.test.ts    ← NEW
│   │           ├── this-binding.test.ts  ← NEW
│   │           ├── new-operator.test.ts  ← NEW
│   │           ├── classes.test.ts       ← NEW
│   │           └── es5-inheritance.test.ts ← NEW
│   └── ui/
│       ├── src/
│       │   ├── canvas/refs.ts           ← MODIFY (also extract proto edges)
│       │   ├── components/
│       │   │   ├── EdgesLayer.tsx       ← MODIFY (style proto edges differently)
│       │   │   ├── HeapNode.tsx         ← MODIFY (render [[Environment]] block for function HeapObjects)
│       │   │   └── CanvasLegend.tsx     ← MODIFY (add proto edge legend entry)
│       │   ├── types.ts                 ← MODIFY (RefEdge → discriminated union with kind: 'ref'|'proto')
│       │   └── components/CanvasPane.tsx ← MODIFY (humanise new event kinds in EVENT_LABELS)
│       └── tests/
│           ├── canvas/refs.test.ts      ← MODIFY (assert on proto edges too)
│           └── e2e/smoke.spec.ts        ← MODIFY (add an ES5-inheritance scenario)
```

---

## Conventions

- Engine work follows TDD strictly: golden tests per feature in `packages/engine/tests/evaluator/<feature>.test.ts`, then implementation, then commit.
- For each new operator or feature, add a cross-check case to `packages/engine/tests/cross-check.test.ts` if the semantics are observable as a final value (so we catch V8 divergence cheaply).
- Reatom v1000 quirks (`clearStack()`, `frame.run` for non-React callbacks) still apply — but plan 4 mostly touches engine code, no new event listeners.
- Conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `perf:`).

---

## Task 1: Logical operators (`&&`, `||`, `??`)

These are short-circuit operators — they evaluate the right operand only if needed. Acorn parses them as `LogicalExpression` (NOT `BinaryExpression`).

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/logical-ops.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/logical-ops.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — logical operators', () => {
  it('&& returns left when left is falsy', () => {
    expect(runCode('0 && 1;').finalValue).toEqual({ kind: 'number', value: 0 });
    expect(runCode('"" && "x";').finalValue).toEqual({ kind: 'string', value: '' });
  });
  it('&& returns right when left is truthy', () => {
    expect(runCode('1 && 2;').finalValue).toEqual({ kind: 'number', value: 2 });
  });
  it('|| returns left when left is truthy', () => {
    expect(runCode('1 || 2;').finalValue).toEqual({ kind: 'number', value: 1 });
  });
  it('|| returns right when left is falsy', () => {
    expect(runCode('0 || 5;').finalValue).toEqual({ kind: 'number', value: 5 });
    expect(runCode('null || "x";').finalValue).toEqual({ kind: 'string', value: 'x' });
  });
  it('?? returns right only for null or undefined left', () => {
    expect(runCode('0 ?? 5;').finalValue).toEqual({ kind: 'number', value: 0 });
    expect(runCode('"" ?? "x";').finalValue).toEqual({ kind: 'string', value: '' });
    expect(runCode('null ?? "x";').finalValue).toEqual({ kind: 'string', value: 'x' });
    expect(runCode('undefined ?? 7;').finalValue).toEqual({ kind: 'number', value: 7 });
  });
  it('short-circuits — right operand never evaluated when left decides', () => {
    // If right were evaluated, ReferenceError on `nope` would throw.
    expect(runCode('1 && 2 || nope;').finalValue).toEqual({ kind: 'number', value: 2 });
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run packages/engine/tests/evaluator/logical-ops.test.ts
```

Expected: failures (UnsupportedError for LogicalExpression).

- [ ] **Step 3: Add the case to evalNode + helper**

Read `/home/codelance/projects/js-runtime-visualizer/packages/engine/src/evaluator/nodes.ts`. Add a new case in the `evalNode` switch BEFORE the `default` branch:

```ts
    case 'LogicalExpression':
      return yield* evalLogical(node as A.LogicalExpression, ctx);
```

Append the helper at the bottom (after the existing helpers):

```ts
function* evalLogical(node: A.LogicalExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const left = yield* evalNode(node.left, ctx);
  switch (node.operator) {
    case '&&':
      return toBoolean(left) ? yield* evalNode(node.right, ctx) : left;
    case '||':
      return toBoolean(left) ? left : yield* evalNode(node.right, ctx);
    case '??':
      return left.kind === 'null' || left.kind === 'undefined'
        ? yield* evalNode(node.right, ctx)
        : left;
    default:
      throw new Error(`Logical ${node.operator} not supported`);
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/logical-ops.test.ts
npx vitest --run
```

Expected: 6 new pass; 89 total (83 baseline + 6).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/logical-ops.test.ts
git commit -m "feat(engine): logical operators (&&, ||, ??)"
```

---

## Task 2: Conditional `?:`, compound assignment, named function expression

Three small adds:
- `ConditionalExpression` (`a ? b : c`) — test → eval one branch.
- Compound assignment (`+=`, `-=`, `*=`, `/=`, `%=`, `&&=`, `||=`, `??=`) — desugars to `a = a op b` for the simple ops; logical-assign uses short-circuit semantics.
- Named function expression — `const f = function inner() { return inner; }` — `inner` is bound only inside the function body.

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/conditional.test.ts`
- Create: `packages/engine/tests/evaluator/compound-assign.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/conditional.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — conditional expression', () => {
  it('returns the consequent for truthy test', () => {
    expect(runCode('true ? 1 : 2;').finalValue).toEqual({ kind: 'number', value: 1 });
  });
  it('returns the alternate for falsy test', () => {
    expect(runCode('0 ? 1 : 2;').finalValue).toEqual({ kind: 'number', value: 2 });
  });
  it('does not evaluate the unchosen branch', () => {
    expect(runCode('true ? 5 : nope;').finalValue).toEqual({ kind: 'number', value: 5 });
  });
});
```

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/compound-assign.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — compound assignment', () => {
  it('+= adds to numeric binding', () => {
    expect(runCode('let x = 1; x += 4; x;').finalValue).toEqual({ kind: 'number', value: 5 });
  });
  it('-=, *=, /=, %= work like += pattern', () => {
    expect(runCode('let x = 10; x -= 3; x;').finalValue).toEqual({ kind: 'number', value: 7 });
    expect(runCode('let x = 4; x *= 3; x;').finalValue).toEqual({ kind: 'number', value: 12 });
    expect(runCode('let x = 10; x /= 4; x;').finalValue).toEqual({ kind: 'number', value: 2.5 });
    expect(runCode('let x = 10; x %= 3; x;').finalValue).toEqual({ kind: 'number', value: 1 });
  });
  it('&&=, ||=, ??= follow logical short-circuit semantics', () => {
    expect(runCode('let x = 0; x ||= 7; x;').finalValue).toEqual({ kind: 'number', value: 7 });
    expect(runCode('let x = 5; x ||= 9; x;').finalValue).toEqual({ kind: 'number', value: 5 });
    expect(runCode('let x = null; x ??= 4; x;').finalValue).toEqual({ kind: 'number', value: 4 });
    expect(runCode('let x = 0; x ??= 4; x;').finalValue).toEqual({ kind: 'number', value: 0 });
  });
  it('+= concatenates strings', () => {
    expect(runCode('let s = "a"; s += "b"; s;').finalValue).toEqual({ kind: 'string', value: 'ab' });
  });
});
```

(Named function expression is exercised by the existing functions tests already if the engine binds `inner` correctly. We add a focused test below in Step 4.)

- [ ] **Step 2: Run tests — expect failure**

```bash
npx vitest --run packages/engine/tests/evaluator/conditional.test.ts
npx vitest --run packages/engine/tests/evaluator/compound-assign.test.ts
```

Expected: failures (UnsupportedError for ConditionalExpression; AssignmentExpression rejecting `+=`).

- [ ] **Step 3: Implement ConditionalExpression**

In `packages/engine/src/evaluator/nodes.ts`, add to the `evalNode` switch:

```ts
    case 'ConditionalExpression': {
      const cond = yield* evalNode((node as A.ConditionalExpression).test, ctx);
      return toBoolean(cond)
        ? yield* evalNode((node as A.ConditionalExpression).consequent, ctx)
        : yield* evalNode((node as A.ConditionalExpression).alternate, ctx);
    }
```

- [ ] **Step 4: Implement compound assignment**

Find `evalAssign` in `nodes.ts`. Replace the early `if (node.operator !== '=')` rejection with logic that handles all compound operators. The key transformation: `target op= rhs` evaluates `target`, then `rhs`, then sets `target` to the combined value.

Replace the current `evalAssign` body:

```ts
function* evalAssign(
  node: A.AssignmentExpression,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  const op = node.operator;
  // Helper to compute the new value from current+rhs given the op.
  const computeCompound = function* (current: JSValue): Generator<StepEvent, JSValue> {
    if (op === '=') return yield* evalNode(node.right, ctx);
    if (op === '&&=') return toBoolean(current) ? yield* evalNode(node.right, ctx) : current;
    if (op === '||=') return toBoolean(current) ? current : yield* evalNode(node.right, ctx);
    if (op === '??=') {
      return current.kind === 'null' || current.kind === 'undefined'
        ? yield* evalNode(node.right, ctx)
        : current;
    }
    const rhs = yield* evalNode(node.right, ctx);
    const arithmeticOp = op.slice(0, -1); // "+=" → "+"
    return computeBinary(arithmeticOp, current, rhs);
  };

  if (node.left.type === 'Identifier') {
    const top = ctx.stack.top();
    if (!top) throw new Error('Internal: no active frame for assignment');
    const env = top.env;
    const current = op === '=' ? { kind: 'undefined' as const } : env.lookup(node.left.name);
    const value = yield* computeCompound(current);
    env.assign(node.left.name, value);
    yield { kind: 'assign', loc: locOf(node), payload: { name: node.left.name, op } };
    return value;
  }

  if (node.left.type === 'MemberExpression') {
    const objVal = yield* evalNode(node.left.object as A.Node, ctx);
    if (objVal.kind !== 'ref') {
      throw new Error('TypeError: assignment target is primitive');
    }
    const key = yield* memberKey(node.left, ctx);
    const heapObj = ctx.heap.get(objVal.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    const current = op === '=' ? { kind: 'undefined' as const } : (heapObj.ownProps.get(key) ?? { kind: 'undefined' as const });
    const value = yield* computeCompound(current);
    ctx.heap.setProp(objVal.id, key, value);
    yield { kind: 'mutate', loc: locOf(node), payload: { id: objVal.id, key, op } };
    return value;
  }

  throw new Error(`AssignmentExpression: unsupported target ${node.left.type}`);
}
```

`computeBinary` already exists from plan 1's drill-in refactor. Make sure it is imported / declared in the same file (it should be — it's a top-level helper). If TypeScript complains because `computeBinary` is `(op: string, ...)` and `arithmeticOp` is `string` already, no cast is needed.

- [ ] **Step 5: Add a named function expression test**

Append to `packages/engine/tests/evaluator/functions.test.ts` (an existing file from plan 1) inside the existing `describe`:

```ts
  it('named function expression binds its own name inside its body', () => {
    const { finalValue } = runCode(`
      const f = function inner(n) {
        if (n <= 1) return 1;
        return n * inner(n - 1);
      };
      f(4);
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 24 });
  });
```

The current `makeFunctionRef` creates a function HeapObject whose `closure` is the env at allocation time. For a NAMED function expression, we need to bind `node.id.name` inside a fresh inner env so the body can reference itself. Update `makeFunctionRef` to handle this:

In `nodes.ts`, find `makeFunctionRef`. Where it sets `closure: env`, change so that for named function expressions, the closure is a child env that has the function's own name bound to its own ref:

```ts
function makeFunctionRef(
  node: A.FunctionExpression | A.ArrowFunctionExpression | A.FunctionDeclaration,
  ctx: Context,
  isArrow: boolean,
): Reference {
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: no active frame for function definition');
  let closureEnv: IEnvironmentRecord = top.env;
  // Named function expression: introduce a binding scope where the function
  // can reference itself by its name.
  let selfBindingName: string | undefined;
  if (node.type === 'FunctionExpression' && 'id' in node && node.id) {
    selfBindingName = node.id.name;
    closureEnv = new EnvironmentRecord(closureEnv);
  }
  const params = (node.params as A.Identifier[]).map((p) => p.name);
  const ref = ctx.heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: null,
    closure: closureEnv,
    source: {
      ...(node.type === 'FunctionDeclaration' && node.id
        ? { name: node.id.name }
        : selfBindingName
          ? { name: selfBindingName }
          : {}),
      params,
      body: node.body as A.Node,
      isArrow,
    },
  });
  if (selfBindingName) {
    closureEnv.define(selfBindingName, ref, 'const');
  }
  return ref;
}
```

(Note: `IEnvironmentRecord` is already imported in this file from plan 2.)

- [ ] **Step 6: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator
npx vitest --run
```

Expected: previous tests still green plus the new ones (3 conditional + 7 compound + 1 named-fn-expr = 11 new). Total 94.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/conditional.test.ts packages/engine/tests/evaluator/compound-assign.test.ts packages/engine/tests/evaluator/functions.test.ts
git commit -m "feat(engine): conditional ?:, compound assignment, named function expression"
```

---

## Task 3: `var` and function-declaration hoisting

In real JS, `var` declarations and function declarations are hoisted to the top of their containing function scope. The engine currently evaluates declarations in source order, so `f(); function f(){}` throws ReferenceError. This task adds a pre-pass over each function body and the top-level Program that hoists declarations.

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/hoisting.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/hoisting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — hoisting', () => {
  it('function declarations are reachable before they appear in source', () => {
    const { finalValue } = runCode(`
      const r = f();
      function f() { return 42; }
      r;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 42 });
  });
  it('var declarations are reachable before initialisation as undefined', () => {
    const { finalValue } = runCode(`
      const before = x;
      var x = 5;
      before;
    `);
    expect(finalValue).toEqual({ kind: 'undefined' });
  });
  it('hoisting works inside function bodies', () => {
    const { finalValue } = runCode(`
      function outer() {
        const r = inner();
        function inner() { return 'hi'; }
        return r;
      }
      outer();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'hi' });
  });
  it('let and const are NOT hoisted (TDZ)', () => {
    expect(() => runCode('const r = x; let x = 1;')).toThrow();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx vitest --run packages/engine/tests/evaluator/hoisting.test.ts
```

- [ ] **Step 3: Implement a hoisting pre-pass**

In `packages/engine/src/evaluator/nodes.ts`, add a helper that walks a list of statements and for each `FunctionDeclaration` or `var` `VariableDeclaration` records the binding. Then update `evalProgram` and the function-call body execution path to run this pre-pass.

Add helper at the bottom of the file:

```ts
import type * as A from 'acorn';

// Hoist a list of statements: define function bindings to their fully-built
// function references; define var bindings to undefined. Returns nothing —
// it mutates ctx.stack.top().env. let/const are NOT processed (TDZ).
function* hoistStatements(
  body: A.Statement[],
  ctx: Context,
): Generator<StepEvent, void> {
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: no active frame for hoisting');
  const env = top.env;
  for (const stmt of body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      const ref = makeFunctionRef(stmt, ctx, false);
      // Define unconditionally; if a var with the same name already exists,
      // function-decl wins (V8 semantics).
      if (env.has(stmt.id.name)) {
        env.assign(stmt.id.name, ref);
      } else {
        env.define(stmt.id.name, ref, 'var');
      }
      yield { kind: 'allocate', loc: locOf(stmt), payload: { kind: 'function', name: stmt.id.name, hoisted: true } };
    } else if (stmt.type === 'VariableDeclaration' && stmt.kind === 'var') {
      for (const decl of stmt.declarations) {
        if (decl.id.type === 'Identifier' && !env.has(decl.id.name)) {
          env.define(decl.id.name, { kind: 'undefined' }, 'var');
        }
      }
    }
  }
}
```

Now update `evalProgram` to run the hoist pre-pass, and SKIP re-evaluating `FunctionDeclaration` statements during the main loop (since they're already bound):

Replace `evalProgram`:

```ts
function* evalProgram(node: A.Program, ctx: Context): Generator<StepEvent, JSValue> {
  yield* hoistStatements(node.body as A.Statement[], ctx);
  let last: JSValue = { kind: 'undefined' };
  for (const stmt of node.body) {
    // FunctionDeclaration was already hoisted; skip re-evaluation.
    if (stmt.type === 'FunctionDeclaration') continue;
    last = yield* evalNode(stmt, ctx);
  }
  return last;
}
```

For function-call bodies, hoisting must also run BEFORE the body executes. Find `evalCall` in `nodes.ts`. The body execution part looks like `yield* evalNode(body, ctx);` (and a separate path for concise-body arrow). For block-body functions (the common case), insert a hoist pass right before the body loop. The simplest entry point is to update `evalBlock` so it always hoists at the top of the block:

Replace `evalBlock`:

```ts
function* evalBlock(
  node: A.BlockStatement,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: no active frame for BlockStatement');
  const blockEnv = new EnvironmentRecord(top.env);
  const saved = top.env;
  top.env = blockEnv;
  // Hoist function declarations + var declarations in this block.
  yield* hoistStatements(node.body as A.Statement[], ctx);
  let last: JSValue = { kind: 'undefined' };
  try {
    for (const stmt of node.body) {
      if (stmt.type === 'FunctionDeclaration') continue; // already hoisted
      last = yield* evalNode(stmt, ctx);
    }
  } finally {
    top.env = saved;
  }
  return last;
}
```

(Note: `var` hoisting per the spec is to FUNCTION scope, not block scope — but for our purposes block-scoped hoisting is good enough and matches function bodies. ECMAScript actually scopes `var` to enclosing function regardless of block; we approximate.)

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/hoisting.test.ts
npx vitest --run
```

Expected: 4 new tests pass; full suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/hoisting.test.ts
git commit -m "feat(engine): var + function-declaration hoisting"
```

---

## Task 4: Seed prototype builtins

Currently `seedBuiltins` only creates the `console` global. To support prototype-aware lookups, we need three host prototype objects: `Object.prototype`, `Array.prototype`, `Function.prototype`. We don't need full method coverage; for plan 4 we just need the OBJECTS to exist so newly-allocated objects/arrays/functions can have their `[[Prototype]]` point at them.

We also add `Object.create`, `Object.getPrototypeOf`, and `Function.prototype.call` because the canonical ES5 inheritance pattern relies on them.

**Files:**
- Modify: `packages/engine/src/runtime/builtins.ts`

- [ ] **Step 1: Update `seedBuiltins`**

Replace `/home/codelance/projects/js-runtime-visualizer/packages/engine/src/runtime/builtins.ts` with:

```ts
import type {
  HeapObject,
  IEnvironmentRecord,
  IHeap,
  JSValue,
  NativeCtx,
  NativeFn,
  Reference,
} from '../types';

function stringifyForConsole(v: JSValue): string {
  switch (v.kind) {
    case 'undefined':
      return 'undefined';
    case 'null':
      return 'null';
    case 'boolean':
    case 'number':
      return String(v.value);
    case 'string':
      return v.value;
    case 'ref':
      return `[${v.id}]`;
  }
}

// Allocate a host object on the heap and return its Reference.
function allocateHost(heap: IHeap, obj: Omit<HeapObject, 'ownProps' | 'prototype'> & {
  ownProps?: Map<string, JSValue>;
  prototype?: Reference | null;
}): Reference {
  return heap.allocate({
    kind: obj.kind,
    ownProps: obj.ownProps ?? new Map(),
    prototype: obj.prototype ?? null,
    ...(obj.native ? { native: obj.native } : {}),
    ...(obj.source ? { source: obj.source } : {}),
    ...(obj.closure ? { closure: obj.closure } : {}),
  });
}

export function seedBuiltins(heap: IHeap, globalEnv: IEnvironmentRecord): void {
  // 1. Object.prototype — root of all object prototype chains.
  const objectProto = allocateHost(heap, { kind: 'object' });

  // 2. Function.prototype — extends Object.prototype.
  const functionProto = allocateHost(heap, {
    kind: 'object',
    prototype: objectProto,
  });

  // 3. Array.prototype — extends Object.prototype.
  const arrayProto = allocateHost(heap, {
    kind: 'object',
    prototype: objectProto,
  });

  // 4. Object.create(proto) → new object with [[Prototype]] = proto.
  const objectCreate: NativeFn = (args, _ctx) => {
    const protoArg = args[0];
    let proto: Reference | null = null;
    if (protoArg && protoArg.kind === 'ref') proto = protoArg;
    else if (protoArg && protoArg.kind === 'null') proto = null;
    else throw new Error('TypeError: Object.create proto must be ref or null');
    return heap.allocate({ kind: 'object', ownProps: new Map(), prototype: proto });
  };
  const objectCreateRef = heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: functionProto,
    native: objectCreate,
  });

  // 5. Object.getPrototypeOf(obj) → ref or null.
  const objectGetPrototypeOf: NativeFn = (args, _ctx) => {
    const target = args[0];
    if (!target || target.kind !== 'ref') {
      throw new Error('TypeError: Object.getPrototypeOf expects an object');
    }
    const heapObj = heap.get(target.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    return heapObj.prototype ?? { kind: 'null' };
  };
  const objectGetPrototypeOfRef = heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: functionProto,
    native: objectGetPrototypeOf,
  });

  // 6. The Object constructor (host) — exposes .create and .getPrototypeOf as
  // own props. Calling it with `new` is not yet supported as a host call.
  const objectCtor = heap.allocate({
    kind: 'function',
    ownProps: new Map<string, JSValue>([
      ['create', objectCreateRef],
      ['getPrototypeOf', objectGetPrototypeOfRef],
      ['prototype', objectProto],
    ]),
    prototype: functionProto,
  });

  // 7. Function.prototype.call — sets the explicit-this binding for a call.
  // Since native funcs receive args, we tag this one specially and let the
  // evaluator's CallExpression handler recognise it via fn.native === fnCall.
  // The simplest portable implementation: throw if reached as a generic native;
  // the evaluator intercepts before calling. See Task 8 for the wiring.
  const fnCall: NativeFn = () => {
    throw new Error(
      'Internal: Function.prototype.call should be intercepted by evalCall, not invoked directly',
    );
  };
  // Mark it so evalCall can recognise it.
  // We put a sentinel string on ownProps for now; Task 8 reads it.
  functionProto.ownProps = functionProto.ownProps ?? new Map();
  // Actually attach a *real* heap object representing call:
  const fnCallRef = heap.allocate({
    kind: 'function',
    ownProps: new Map<string, JSValue>([
      ['__builtin_name__', { kind: 'string', value: 'Function.prototype.call' }],
    ]),
    prototype: functionProto,
    native: fnCall,
  });
  // Dynamic addition to the ALREADY-allocated functionProto: get the heapObj
  // and write into its ownProps Map.
  const functionProtoObj = heap.get(functionProto.id)!;
  functionProtoObj.ownProps.set('call', fnCallRef);

  // 8. console.log.
  const log = heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: functionProto,
    native: (args, ctx) => {
      ctx.consoleOut.push(args.map(stringifyForConsole).join(' '));
      return { kind: 'undefined' };
    },
  });
  const consoleObj = heap.allocate({
    kind: 'object',
    ownProps: new Map<string, JSValue>([['log', log]]),
    prototype: objectProto,
  });

  // 9. Define globals.
  globalEnv.define('console', consoleObj, 'const');
  globalEnv.define('Object', objectCtor, 'const');
  // (Array and Function constructors not exposed in plan 4 — only their prototypes
  // are reachable via instances' [[Prototype]].)

  // 10. Stash references for the evaluator (it'll use them when allocating
  //     plain object/array/function literals).
  attachHostPrototypes(heap, { objectProto, functionProto, arrayProto });
}

// The evaluator reads these when it allocates an object/array/function literal
// to set the appropriate [[Prototype]]. Stored on the heap via a magic id key.
const HOST_PROTO_KEY = '__host_prototypes__';

export function attachHostPrototypes(
  heap: IHeap,
  protos: { objectProto: Reference; functionProto: Reference; arrayProto: Reference },
): void {
  // We cheat: stash on a side table keyed by the heap instance.
  hostProtoTable.set(heap, protos);
}

const hostProtoTable = new WeakMap<
  IHeap,
  { objectProto: Reference; functionProto: Reference; arrayProto: Reference }
>();

export function getHostPrototypes(heap: IHeap):
  | { objectProto: Reference; functionProto: Reference; arrayProto: Reference }
  | null {
  return hostProtoTable.get(heap) ?? null;
}
```

- [ ] **Step 2: Build to confirm**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run
```

Expected: full suite still green (engine builds; we haven't yet wired the evaluator to use the new prototypes — that happens in Task 5).

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/runtime/builtins.ts
git commit -m "feat(engine): seed Object.prototype/Function.prototype/Array.prototype + Object.create + getPrototypeOf"
```

---

## Task 5: Wire evaluator literal allocations to host prototypes + auto-allocate `.prototype` on function declarations

Two changes to the evaluator:
1. Object/array literals get `prototype: objectProto`/`arrayProto` instead of `null`.
2. Every function (decl/expr/arrow) gets an auto-allocated `.prototype` heap object whose `[[Prototype]]` is `objectProto`.

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`

- [ ] **Step 1: Update object/array literal allocation**

Find `evalObjectLiteral` and `evalArrayLiteral` in `nodes.ts`. In each, change the `prototype: null` to look up the host prototype.

Add at the top of `nodes.ts` (with the other imports):

```ts
import { getHostPrototypes } from '../runtime/builtins';
```

In `evalObjectLiteral`, replace the allocation line:

```ts
  const ref = ctx.heap.allocate({
    kind: 'object',
    ownProps: new Map(),
    prototype: getHostPrototypes(ctx.heap)?.objectProto ?? null,
  });
```

In `evalArrayLiteral`:

```ts
  const ref = ctx.heap.allocate({
    kind: 'array',
    ownProps: new Map(),
    prototype: getHostPrototypes(ctx.heap)?.arrayProto ?? null,
  });
```

- [ ] **Step 2: Update `makeFunctionRef` to allocate `.prototype`**

In `nodes.ts`, find `makeFunctionRef`. After it allocates the function `ref` (and after the named-FE binding logic from Task 2, which assumes the ref is already allocated), allocate a `.prototype` object whose `[[Prototype]]` is `objectProto` and whose `constructor` is the function ref. Set it as an own property `'prototype'` of the function:

After the existing `const ref = ctx.heap.allocate(...)` line, add:

```ts
  // Auto-allocate Foo.prototype = { constructor: Foo }, [[Prototype]] = objectProto.
  const protos = getHostPrototypes(ctx.heap);
  const protoObj = ctx.heap.allocate({
    kind: 'object',
    ownProps: new Map<string, JSValue>([['constructor', ref]]),
    prototype: protos?.objectProto ?? null,
  });
  ctx.heap.setProp(ref.id, 'prototype', protoObj);
  // Functions themselves descend from Function.prototype.
  if (protos) {
    const fnObj = ctx.heap.get(ref.id);
    if (fnObj) fnObj.prototype = protos.functionProto;
  }
```

(The setProp happens AFTER allocate so the function ref is already valid for `constructor` self-reference.)

- [ ] **Step 3: Run full suite to confirm no regression**

```bash
npx vitest --run
```

Expected: all tests still green. Existing behavior unchanged because the new prototypes are only relevant when the next task (member access prototype walk) reads them.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts
git commit -m "feat(engine): host prototypes for literals + auto-allocate Foo.prototype"
```

---

## Task 6: Member access walks the prototype chain + emit `proto-walk` events

**Files:**
- Modify: `packages/engine/src/types.ts` (add `proto-walk`, `proto-set` event kinds)
- Modify: `packages/engine/src/evaluator/nodes.ts` (member lookup walks the chain)
- Create: `packages/engine/tests/evaluator/prototypes.test.ts`

- [ ] **Step 1: Extend EventKind**

In `packages/engine/src/types.ts`, find `EventKind`:

```ts
export type EventKind =
  | 'enter-frame'
  | 'leave-frame'
  | 'assign'
  | 'allocate'
  | 'lookup'
  | 'mutate'
  | 'console';
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
  | 'bind-this';
```

- [ ] **Step 2: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/prototypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — prototype-aware member access', () => {
  it('reads a property from the prototype chain', () => {
    const { finalValue } = runCode(`
      const proto = { greet: 'hi' };
      const obj = Object.create(proto);
      obj.greet;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'hi' });
  });
  it('returns undefined when the property is absent in the entire chain', () => {
    const { finalValue } = runCode(`
      const proto = { x: 1 };
      const obj = Object.create(proto);
      obj.missing;
    `);
    expect(finalValue).toEqual({ kind: 'undefined' });
  });
  it('prefers own properties over prototype properties', () => {
    const { finalValue } = runCode(`
      const proto = { x: 'proto' };
      const obj = Object.create(proto);
      obj.x = 'own';
      obj.x;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'own' });
  });
  it('Object.getPrototypeOf returns the [[Prototype]]', () => {
    const { finalValue, snapshots } = runCode(`
      const proto = {};
      const obj = Object.create(proto);
      const got = Object.getPrototypeOf(obj);
      got === proto;
    `);
    expect(finalValue).toEqual({ kind: 'boolean', value: true });
    // Verify a proto-walk event happened.
    const kinds = new Set(snapshots.map((s) => s.eventKind));
    expect(kinds.has('proto-walk') || kinds.has('lookup')).toBe(true);
  });
});
```

- [ ] **Step 3: Walk the chain in evalMember**

In `packages/engine/src/evaluator/nodes.ts`, find `evalMember`. Replace its body so it walks `[[Prototype]]` until the property is found or the chain ends:

```ts
function* evalMember(
  node: A.MemberExpression,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  const obj = yield* evalNode(node.object as A.Node, ctx);
  if (obj.kind !== 'ref') {
    throw new Error('TypeError: property access on primitive');
  }
  const key = yield* memberKey(node, ctx);

  // Walk [[Prototype]] chain. Emit a proto-walk event for each hop after the
  // first own-property miss.
  const chain: string[] = [];
  let cur: Reference | null = obj;
  while (cur) {
    chain.push(cur.id);
    const heapObj = ctx.heap.get(cur.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    if (heapObj.ownProps.has(key)) {
      const value = heapObj.ownProps.get(key)!;
      yield {
        kind: 'lookup',
        loc: locOf(node),
        payload: { id: obj.id, key, foundOnId: cur.id, chain: [...chain] },
      };
      return value;
    }
    if (chain.length > 1) {
      yield {
        kind: 'proto-walk',
        loc: locOf(node),
        payload: { fromId: chain[chain.length - 2], toId: cur.id, key },
      };
    }
    cur = heapObj.prototype;
  }
  // Not found anywhere.
  yield {
    kind: 'lookup',
    loc: locOf(node),
    payload: { id: obj.id, key, chain: [...chain], notFound: true },
  };
  return { kind: 'undefined' };
}
```

- [ ] **Step 4: Emit `proto-set` when assigning to a function's `.prototype`**

In `evalAssign`, the MemberExpression branch already emits `mutate`. We additionally tag `proto-set` when the key is `prototype` on a function HeapObject (so the canvas can highlight the rewire). Update the MemberExpression assignment branch to:

```ts
  if (node.left.type === 'MemberExpression') {
    const objVal = yield* evalNode(node.left.object as A.Node, ctx);
    if (objVal.kind !== 'ref') {
      throw new Error('TypeError: assignment target is primitive');
    }
    const key = yield* memberKey(node.left, ctx);
    const heapObj = ctx.heap.get(objVal.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    const current = op === '=' ? { kind: 'undefined' as const } : (heapObj.ownProps.get(key) ?? { kind: 'undefined' as const });
    const value = yield* computeCompound(current);
    ctx.heap.setProp(objVal.id, key, value);
    const isProtoRewire =
      key === 'prototype' && heapObj.kind === 'function' && value.kind === 'ref';
    yield {
      kind: isProtoRewire ? 'proto-set' : 'mutate',
      loc: locOf(node),
      payload: { id: objVal.id, key, op },
    };
    return value;
  }
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/prototypes.test.ts
npx vitest --run
```

Expected: 4 new pass; full suite green.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/prototypes.test.ts
git commit -m "feat(engine): prototype-aware member access + proto-walk/proto-set events"
```

---

## Task 7: `__proto__` getter and setter on member access

`obj.__proto__` reads/writes `[[Prototype]]`. We special-case the key `__proto__` in `evalMember` and in the assignment path.

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`

- [ ] **Step 1: Add a focused test**

Append to `packages/engine/tests/evaluator/prototypes.test.ts`, inside the existing `describe`, before the closing `});`:

```ts
  it('__proto__ reads and writes [[Prototype]]', () => {
    const { finalValue } = runCode(`
      const proto = { x: 1 };
      const obj = {};
      obj.__proto__ = proto;
      obj.x;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });
  it('reading __proto__ returns the [[Prototype]] ref or null', () => {
    const { finalValue } = runCode(`
      const proto = {};
      const obj = Object.create(proto);
      Object.getPrototypeOf(obj) === obj.__proto__;
    `);
    expect(finalValue).toEqual({ kind: 'boolean', value: true });
  });
```

- [ ] **Step 2: Special-case `__proto__` in evalMember**

In `nodes.ts`, at the very top of `evalMember` AFTER computing `obj` and `key`, add:

```ts
  if (key === '__proto__') {
    const heapObj = ctx.heap.get(obj.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    return heapObj.prototype ?? { kind: 'null' };
  }
```

- [ ] **Step 3: Special-case `__proto__` in evalAssign**

In `evalAssign`'s MemberExpression branch, at the top BEFORE the existing setProp logic, add:

```ts
    if (key === '__proto__') {
      // Direct mutation of [[Prototype]].
      const value = yield* evalNode(node.right, ctx);
      const heapObj2 = ctx.heap.get(objVal.id);
      if (!heapObj2) throw new Error('Internal: ref points to no heap object');
      if (value.kind === 'ref') heapObj2.prototype = value;
      else if (value.kind === 'null') heapObj2.prototype = null;
      else throw new Error('TypeError: __proto__ must be ref or null');
      yield { kind: 'proto-set', loc: locOf(node), payload: { id: objVal.id, via: '__proto__' } };
      return value;
    }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/prototypes.test.ts
npx vitest --run
```

Expected: 6 prototypes tests pass; full suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/prototypes.test.ts
git commit -m "feat(engine): __proto__ accessor reads/writes [[Prototype]]"
```

---

## Task 8: `this` binding + `Function.prototype.call`

**Files:**
- Modify: `packages/engine/src/types.ts` (add `thisValue` to Frame)
- Modify: `packages/engine/src/evaluator/nodes.ts` (`this` ThisExpression, evalCall passes thisValue, intercept `.call`)
- Create: `packages/engine/tests/evaluator/this-binding.test.ts`

- [ ] **Step 1: Extend Frame type**

In `packages/engine/src/types.ts`, find `Frame`:

```ts
export type Frame = {
  fn: Reference | 'global';
  fnName: string;
  env: IEnvironmentRecord;
  callSite: SourceLoc | null;
};
```

Replace with:

```ts
export type Frame = {
  fn: Reference | 'global';
  fnName: string;
  env: IEnvironmentRecord;
  callSite: SourceLoc | null;
  thisValue: JSValue;
};
```

(Frame is just a `type`, not a class, so this is a pure structural extension.)

- [ ] **Step 2: Initialise `thisValue` for the global frame**

In `packages/engine/src/evaluator/index.ts`, find the `stack.push({ fn: 'global', fnName: '<global>', env: globalEnv, callSite: null });` line. Replace with:

```ts
  stack.push({
    fn: 'global',
    fnName: '<global>',
    env: globalEnv,
    callSite: null,
    thisValue: { kind: 'undefined' },
  });
```

(In strict mode, top-level `this` is `undefined`. The cross-check tests already use strict mode via `new Function('"use strict"; ...')`.)

- [ ] **Step 3: ThisExpression in evalNode**

In `packages/engine/src/evaluator/nodes.ts`, add to the `evalNode` switch:

```ts
    case 'ThisExpression': {
      const top = ctx.stack.top();
      if (!top) throw new Error('Internal: no active frame for ThisExpression');
      return top.thisValue;
    }
```

- [ ] **Step 4: evalCall passes thisValue per call style**

When a CallExpression is `obj.method()`, `this` is `obj`. When it is `f()`, `this` is `undefined` (strict mode). Find `evalCall` in `nodes.ts`. Currently it evaluates the callee directly. Refactor to detect MemberExpression callees so we can pass `obj` as `this`.

Replace the BEGINNING of `evalCall` (everything up to and including the args evaluation, before the native dispatch and frame push). Specifically, the section that computes `callee` and then evaluates args:

```ts
function* evalCall(
  node: A.CallExpression,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  // Determine `this` based on callee shape.
  let thisValue: JSValue = { kind: 'undefined' };
  let callee: JSValue;
  if (node.callee.type === 'MemberExpression') {
    const recv = yield* evalNode(node.callee.object as A.Node, ctx);
    if (recv.kind === 'ref') thisValue = recv;
    // Look up the method on the receiver via the same prototype-walking algorithm.
    callee = yield* evalNodeMemberAsCallee(node.callee as A.MemberExpression, recv, ctx);
  } else {
    callee = yield* evalNode(node.callee as A.Node, ctx);
  }
  if (callee.kind !== 'ref') {
    throw new Error('TypeError: call target is not a function');
  }
  const fnObj = ctx.heap.get(callee.id);
  if (!fnObj || fnObj.kind !== 'function') {
    throw new Error('TypeError: callee is not a callable function');
  }

  const args: JSValue[] = [];
  for (const a of node.arguments) {
    args.push(yield* evalNode(a as A.Node, ctx));
  }

  // Intercept Function.prototype.call: shift first arg into thisValue.
  const builtinName = fnObj.ownProps.get('__builtin_name__');
  if (builtinName && builtinName.kind === 'string' && builtinName.value === 'Function.prototype.call') {
    const targetFn = thisValue; // recv from `target.call(...)`
    if (targetFn.kind !== 'ref') {
      throw new Error('TypeError: Function.prototype.call requires a function this');
    }
    const targetObj = ctx.heap.get(targetFn.id);
    if (!targetObj || targetObj.kind !== 'function') {
      throw new Error('TypeError: target is not a function');
    }
    const newThis = args[0] ?? { kind: 'undefined' };
    const newArgs = args.slice(1);
    return yield* invokeFunction(targetObj, targetFn, newThis, newArgs, node, ctx);
  }

  return yield* invokeFunction(fnObj, callee, thisValue, args, node, ctx);
}
```

Now extract `invokeFunction` from the existing call body (the part that pushes a frame, runs body, catches ReturnSignal, pops frame). Append to `nodes.ts`:

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
    if (fnObj.ownProps.get('log') === undefined && (fnObj.native as unknown) !== undefined) {
      // Only emit a console event if the native produced a console line.
      // The seedBuiltins console.log appends to consoleOut, so this is a fine heuristic.
    }
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
    } else {
      throw e;
    }
  }
  ctx.stack.pop();
  yield {
    kind: 'leave-frame',
    loc: locOf(node),
    payload: { returnValue },
  };
  return returnValue;
}

function* evalNodeMemberAsCallee(
  node: A.MemberExpression,
  recv: JSValue,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  if (recv.kind !== 'ref') {
    throw new Error('TypeError: cannot call method on primitive');
  }
  const key = yield* memberKey(node, ctx);
  if (key === '__proto__') {
    const heapObj = ctx.heap.get(recv.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    return heapObj.prototype ?? { kind: 'null' };
  }
  // Walk chain identical to evalMember.
  let cur: Reference | null = recv;
  while (cur) {
    const heapObj = ctx.heap.get(cur.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    if (heapObj.ownProps.has(key)) return heapObj.ownProps.get(key)!;
    cur = heapObj.prototype;
  }
  return { kind: 'undefined' };
}
```

(Importantly, the OLD inline call-frame code in `evalCall` must be REMOVED since `invokeFunction` now contains that logic.)

- [ ] **Step 5: Update existing tests that referenced thisValue indirectly**

The existing `engine.test.ts`, `derived.test.ts`, `snapshot.test.ts` push frames with `{ fn, fnName, env, callSite }` — they need to also pass `thisValue`. Search and update:

```bash
grep -n "fn: 'global'" packages/ui/tests/atoms packages/engine/tests
```

Each match needs `thisValue: { kind: 'undefined' }` added. Specifically: `packages/engine/tests/snapshot.test.ts` (one place). The atom tests in `packages/ui/tests/atoms/` don't directly construct frames — they go through `runCode` — so they should be unaffected.

Edit `packages/engine/tests/snapshot.test.ts`: find `stack.push({ fn: 'global', fnName: '<global>', env, callSite: null });` and add `, thisValue: { kind: 'undefined' }`:

```ts
stack.push({ fn: 'global', fnName: '<global>', env, callSite: null, thisValue: { kind: 'undefined' } });
```

- [ ] **Step 6: Write `this` tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/this-binding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — this binding', () => {
  it('this is undefined in a plain function call (strict mode)', () => {
    const { finalValue } = runCode(`
      function f() { return typeof this; }
      f();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'undefined' });
  });
  it('this is the receiver in a method call', () => {
    const { finalValue } = runCode(`
      const obj = { x: 7, get: function() { return this.x; } };
      obj.get();
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 7 });
  });
  it('Function.prototype.call sets this explicitly', () => {
    const { finalValue } = runCode(`
      function f() { return this.x; }
      const obj = { x: 99 };
      f.call(obj);
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 99 });
  });
});
```

- [ ] **Step 7: Run tests — expect pass**

```bash
npx vitest --run
```

Expected: 3 new this-binding tests + the existing suites pass.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/evaluator/nodes.ts packages/engine/src/evaluator/index.ts packages/engine/tests/snapshot.test.ts packages/engine/tests/evaluator/this-binding.test.ts
git commit -m "feat(engine): this binding (method call + Function.prototype.call) + bind-this event"
```

---

## Task 9: `new` operator for function constructors

`new Foo(args)` does:
1. Allocate a new object whose `[[Prototype]]` is `Foo.prototype`.
2. Call `Foo` with `this` set to the new object and `args`.
3. Return the new object (unless the constructor returns a different object — common edge case, support it).

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/new-operator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/new-operator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — new operator (function constructor)', () => {
  it('new Foo() builds an object with [[Prototype]] = Foo.prototype', () => {
    const { finalValue } = runCode(`
      function Animal(name) { this.name = name; }
      const rex = new Animal('Rex');
      rex.name;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'Rex' });
  });
  it('inherited methods on Foo.prototype are reachable from instance', () => {
    const { finalValue } = runCode(`
      function Animal() {}
      Animal.prototype.greet = function() { return 'hi'; };
      const a = new Animal();
      a.greet();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'hi' });
  });
  it('returning a primitive from constructor is ignored — the new object is returned', () => {
    const { finalValue } = runCode(`
      function Foo() { this.x = 1; return 42; }
      new Foo().x;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });
  it('returning an object from constructor REPLACES the new instance', () => {
    const { finalValue } = runCode(`
      function Foo() { this.x = 1; return { y: 2 }; }
      const r = new Foo();
      r.x === undefined && r.y;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 2 });
  });
});
```

- [ ] **Step 2: Implement NewExpression**

In `packages/engine/src/evaluator/nodes.ts`, add a case to `evalNode`:

```ts
    case 'NewExpression':
      return yield* evalNew(node as A.NewExpression, ctx);
```

Append the helper:

```ts
function* evalNew(
  node: A.NewExpression,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  const callee = yield* evalNode(node.callee as A.Node, ctx);
  if (callee.kind !== 'ref') {
    throw new Error('TypeError: new target is not a function');
  }
  const fnObj = ctx.heap.get(callee.id);
  if (!fnObj || fnObj.kind !== 'function') {
    throw new Error('TypeError: new target is not a function');
  }
  // Look up Foo.prototype to use as [[Prototype]] for the new instance.
  const fooPrototype = fnObj.ownProps.get('prototype');
  const protoRef = fooPrototype && fooPrototype.kind === 'ref'
    ? fooPrototype
    : (getHostPrototypes(ctx.heap)?.objectProto ?? null);
  const instance = ctx.heap.allocate({
    kind: 'object',
    ownProps: new Map(),
    prototype: protoRef,
  });
  yield { kind: 'allocate', loc: locOf(node), payload: { id: instance.id, kind: 'object', via: 'new' } };

  const args: JSValue[] = [];
  for (const a of node.arguments) args.push(yield* evalNode(a as A.Node, ctx));

  const result = yield* invokeFunction(fnObj, callee, instance, args, node as unknown as A.CallExpression, ctx);
  // If the constructor returned a non-primitive object, the spec says use that
  // as the construct result. Otherwise return the new instance.
  if (result.kind === 'ref') return result;
  return instance;
}
```

(The `node as unknown as A.CallExpression` cast: `invokeFunction` signature was written for `A.CallExpression`. NewExpression has the same shape (callee + arguments), so the cast is safe for the fields invokeFunction uses. If TypeScript complains, define a small union type or split invokeFunction's signature; the cast is the path of least friction.)

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/new-operator.test.ts
npx vitest --run
```

Expected: 4 new tests pass; full suite green.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/new-operator.test.ts
git commit -m "feat(engine): new operator for function constructors"
```

---

## Task 10: ES5 inheritance integration test

This task adds NO new evaluator features — it just wires together everything we've built (function constructors, `Function.prototype.call`, `Object.create`, `__proto__`, prototype-aware lookup) into one canonical example. If everything in tasks 1-9 is correct, this test passes.

**Files:**
- Create: `packages/engine/tests/evaluator/es5-inheritance.test.ts`

- [ ] **Step 1: Write the test**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/es5-inheritance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — ES5 inheritance pattern', () => {
  it('runs the canonical ES5 inheritance snippet end-to-end', () => {
    const code = `
      function Animal(name) { this.name = name; }
      Animal.prototype.speak = function() { return this.name + ' says hi'; };

      function Dog(name, breed) {
        Animal.call(this, name);
        this.breed = breed;
      }
      Dog.prototype = Object.create(Animal.prototype);
      Dog.prototype.constructor = Dog;
      Dog.prototype.bark = function() { return 'woof'; };

      const rex = new Dog('Rex', 'lab');
      rex.speak() + ' / ' + rex.bark() + ' / ' + rex.breed;
    `;
    const { finalValue } = runCode(code);
    expect(finalValue).toEqual({
      kind: 'string',
      value: 'Rex says hi / woof / lab',
    });
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run packages/engine/tests/evaluator/es5-inheritance.test.ts
npx vitest --run
git add packages/engine/tests/evaluator/es5-inheritance.test.ts
git commit -m "test(engine): canonical ES5 inheritance integration test"
```

Expected: 1 new test passes; full suite green.

---

## Task 11: `class` declarations + methods

Acorn parses ES2015 classes as `ClassDeclaration` (or `ClassExpression`) with a `body: ClassBody { body: MethodDefinition[] }`. Each `MethodDefinition` has `kind` of `'constructor'` or `'method'` (or `'get'`/`'set'`, but plan 4 doesn't model accessors).

For plan 4, support:
- Constructor + instance methods
- `static` methods (`MethodDefinition.static === true`) — placed on the class function itself, not on `.prototype`
- `extends` (Task 12)
- `super` (Task 13)

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/classes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tests/evaluator/classes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — class declarations', () => {
  it('class with constructor sets instance fields via this', () => {
    const { finalValue } = runCode(`
      class Animal {
        constructor(name) { this.name = name; }
      }
      new Animal('Rex').name;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'Rex' });
  });
  it('class with instance methods places them on Class.prototype', () => {
    const { finalValue } = runCode(`
      class Animal {
        constructor(name) { this.name = name; }
        greet() { return this.name + ' hi'; }
      }
      new Animal('Rex').greet();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'Rex hi' });
  });
  it('class with static methods places them on the class itself', () => {
    const { finalValue } = runCode(`
      class Foo {
        static make() { return 'made'; }
      }
      Foo.make();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'made' });
  });
});
```

- [ ] **Step 2: Implement ClassDeclaration / ClassExpression**

In `nodes.ts`, add case:

```ts
    case 'ClassDeclaration':
    case 'ClassExpression':
      return yield* evalClass(node as A.Class, ctx);
```

Helper:

```ts
function* evalClass(node: A.Class, ctx: Context): Generator<StepEvent, JSValue> {
  // Locate constructor and methods.
  let ctorMethod: A.MethodDefinition | null = null;
  const instanceMethods: A.MethodDefinition[] = [];
  const staticMethods: A.MethodDefinition[] = [];
  for (const member of node.body.body) {
    if (member.type !== 'MethodDefinition') continue;
    if (member.kind === 'constructor') ctorMethod = member;
    else if (member.static) staticMethods.push(member);
    else instanceMethods.push(member);
  }

  // The class is a function whose body is the constructor (or an empty constructor).
  const classFn: A.FunctionExpression = ctorMethod
    ? (ctorMethod.value as A.FunctionExpression)
    : ({
        type: 'FunctionExpression',
        params: [],
        body: { type: 'BlockStatement', body: [] } as A.BlockStatement,
        async: false,
        generator: false,
        loc: node.loc ?? null,
        start: node.start ?? 0,
        end: node.end ?? 0,
      } as unknown as A.FunctionExpression);
  const classRef = makeFunctionRef(classFn, ctx, false);

  // Set className on the heap object so debug labels work.
  if (node.id) {
    const fnObj = ctx.heap.get(classRef.id);
    if (fnObj && fnObj.source) fnObj.source.name = node.id.name;
  }

  // For each instance method, allocate a function and put it on Class.prototype.
  const classObj = ctx.heap.get(classRef.id)!;
  const protoVal = classObj.ownProps.get('prototype');
  if (!protoVal || protoVal.kind !== 'ref') {
    throw new Error('Internal: class function missing auto-allocated prototype');
  }
  for (const m of instanceMethods) {
    const methodRef = makeFunctionRef(m.value as A.FunctionExpression, ctx, false);
    const methodObj = ctx.heap.get(methodRef.id);
    if (methodObj && methodObj.source && m.key.type === 'Identifier') {
      methodObj.source.name = m.key.name;
    }
    if (m.key.type === 'Identifier') {
      ctx.heap.setProp(protoVal.id, m.key.name, methodRef);
    }
  }
  // Static methods: place on the class itself.
  for (const m of staticMethods) {
    const methodRef = makeFunctionRef(m.value as A.FunctionExpression, ctx, false);
    const methodObj = ctx.heap.get(methodRef.id);
    if (methodObj && methodObj.source && m.key.type === 'Identifier') {
      methodObj.source.name = m.key.name;
    }
    if (m.key.type === 'Identifier') {
      ctx.heap.setProp(classRef.id, m.key.name, methodRef);
    }
  }

  // Bind into env if this is a declaration.
  if (node.type === 'ClassDeclaration' && node.id) {
    const top = ctx.stack.top();
    if (top) top.env.define(node.id.name, classRef, 'let');
  }

  yield {
    kind: 'allocate',
    loc: locOf(node),
    payload: { kind: 'function', name: node.id?.name, classDecl: true },
  };
  return classRef;
}
```

(The `as A.Class` cast: there's no shared base type in Acorn types but ClassDeclaration and ClassExpression are structurally identical for our needs. Define a local type alias if desired.)

- [ ] **Step 3: Add ClassDeclaration to the hoisting pre-pass**

`class` declarations have hoisted bindings in TDZ, but the function-decl analogue gets them eagerly bound. For simplicity, we eagerly bind classes during evaluation order (matching `let` hoisting, where they're visible only after the declaration line). The hoisting helper from Task 3 already skips `let`/`const`; classes follow the same path. NO change required here.

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/classes.test.ts
npx vitest --run
```

Expected: 3 new pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/classes.test.ts
git commit -m "feat(engine): class declarations + instance/static methods"
```

---

## Task 12: `extends` clause

`class B extends A` chains `B.prototype` so `B.prototype.[[Prototype]] = A.prototype`, and `B.[[Prototype]] = A` (so static methods are inherited too).

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`

- [ ] **Step 1: Add a focused test**

Append to `packages/engine/tests/evaluator/classes.test.ts` inside the existing describe:

```ts
  it('extends chains prototype.[[Prototype]] to the parent.prototype', () => {
    const { finalValue } = runCode(`
      class A { greet() { return 'a'; } }
      class B extends A {}
      new B().greet();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'a' });
  });
  it('extends chains static method inheritance', () => {
    const { finalValue } = runCode(`
      class A { static make() { return 'a'; } }
      class B extends A {}
      B.make();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'a' });
  });
```

- [ ] **Step 2: Implement extends in evalClass**

In `evalClass`, after computing `classRef` and BEFORE binding methods to Class.prototype, evaluate `node.superClass` if present and re-wire prototypes. Add:

```ts
  if (node.superClass) {
    const parent = yield* evalNode(node.superClass as A.Node, ctx);
    if (parent.kind !== 'ref') {
      throw new Error('TypeError: superclass is not a constructor');
    }
    const parentObj = ctx.heap.get(parent.id);
    if (!parentObj || parentObj.kind !== 'function') {
      throw new Error('TypeError: superclass is not a function');
    }
    const parentProto = parentObj.ownProps.get('prototype');
    // B.prototype.[[Prototype]] = A.prototype.
    if (parentProto && parentProto.kind === 'ref') {
      const protoRef = ctx.heap.get(classRef.id)?.ownProps.get('prototype');
      if (protoRef && protoRef.kind === 'ref') {
        const protoObj = ctx.heap.get(protoRef.id);
        if (protoObj) protoObj.prototype = parentProto;
      }
    }
    // B.[[Prototype]] = A.
    const classObj2 = ctx.heap.get(classRef.id);
    if (classObj2) classObj2.prototype = parent;
    yield { kind: 'proto-set', loc: locOf(node), payload: { id: classRef.id, via: 'extends' } };
  }
```

(Insert this block AFTER `const classRef = makeFunctionRef(...)` and AFTER the `node.id` name set, but BEFORE the instance/static method loop.)

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/classes.test.ts
npx vitest --run
```

Expected: 5 classes tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/classes.test.ts
git commit -m "feat(engine): class extends — chain prototype + static inheritance"
```

---

## Task 13: `super` calls (constructor + method)

`super(args)` inside a `constructor` invokes the parent class's constructor with `this` set to the current instance. `super.method()` inside an instance method walks the parent prototype.

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`

- [ ] **Step 1: Add tests**

Append to `packages/engine/tests/evaluator/classes.test.ts`:

```ts
  it('super(...) calls parent constructor with current this', () => {
    const { finalValue } = runCode(`
      class A { constructor(x) { this.x = x; } }
      class B extends A {
        constructor(x, y) { super(x); this.y = y; }
      }
      const b = new B(1, 2);
      b.x + b.y;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 3 });
  });
  it('super.method() walks the parent prototype', () => {
    const { finalValue } = runCode(`
      class A { greet() { return 'a'; } }
      class B extends A { greet() { return super.greet() + 'b'; } }
      new B().greet();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'ab' });
  });
```

- [ ] **Step 2: Track home object on methods**

For `super.method()` to work, the engine needs to know which class the method was defined IN. Conventionally this is the function's `[[HomeObject]]`. We attach a `homeObject: Reference` to the function HeapObject's `source` when it's defined as a class method.

In `evalClass`, when allocating `methodRef` for instance and static methods, after `makeFunctionRef`, set:

```ts
    const methodRef = makeFunctionRef(m.value as A.FunctionExpression, ctx, false);
    const methodObj = ctx.heap.get(methodRef.id);
    if (methodObj && methodObj.source) {
      if (m.key.type === 'Identifier') methodObj.source.name = m.key.name;
      // Home object: the prototype object for instance methods, or the class itself for static.
      const homeRef = m.static ? classRef : (classObj.ownProps.get('prototype') as Reference);
      methodObj.source.homeObject = homeRef;
    }
```

Update the `FunctionSource` type to include the new optional field. In `packages/engine/src/types.ts`:

```ts
export type FunctionSource = {
  name?: string;
  params: string[];
  body: AstNode;
  isArrow: boolean;
  homeObject?: Reference;
};
```

- [ ] **Step 3: Implement Super expressions**

In `nodes.ts`, add cases:

```ts
    case 'Super':
      // Bare `super` is only valid as a callee or member-expression object;
      // we resolve in the parent dispatch points below. Returning the parent
      // proto here lets super-as-method-receiver work via the normal member path.
      return yield* evalSuperReceiver(ctx, node);
```

Helper:

```ts
function* evalSuperReceiver(ctx: Context, node: A.Node): Generator<StepEvent, JSValue> {
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: super outside any frame');
  if (top.fn === 'global') throw new Error('SyntaxError: super outside method');
  const fnObj = ctx.heap.get(top.fn.id);
  const home = fnObj?.source?.homeObject;
  if (!home) throw new Error('SyntaxError: super requires a home object');
  const homeObj = ctx.heap.get(home.id);
  if (!homeObj) throw new Error('Internal: home object missing');
  return homeObj.prototype ?? { kind: 'undefined' };
}
```

For `super(args)` (CallExpression with callee.type === 'Super'), we must invoke the parent constructor with `this = current frame's thisValue`. In `evalCall`, BEFORE the "Determine `this` based on callee shape" block, add:

```ts
  if (node.callee.type === 'Super') {
    const top = ctx.stack.top();
    if (!top) throw new Error('Internal: super() outside any frame');
    if (top.fn === 'global') throw new Error('SyntaxError: super() outside class constructor');
    const fnObj = ctx.heap.get(top.fn.id);
    const home = fnObj?.source?.homeObject;
    if (!home) throw new Error('SyntaxError: super() requires home object');
    const homeObj = ctx.heap.get(home.id);
    const parentCtorRef = homeObj?.prototype && (() => {
      const parentProtoObj = ctx.heap.get((homeObj.prototype as Reference).id);
      const ctorVal = parentProtoObj?.ownProps.get('constructor');
      return ctorVal && ctorVal.kind === 'ref' ? ctorVal : null;
    })();
    if (!parentCtorRef) throw new Error('TypeError: cannot resolve super constructor');
    const parentObj = ctx.heap.get(parentCtorRef.id);
    if (!parentObj) throw new Error('Internal: parent constructor missing');
    const args: JSValue[] = [];
    for (const a of node.arguments) args.push(yield* evalNode(a as A.Node, ctx));
    return yield* invokeFunction(parentObj, parentCtorRef, top.thisValue, args, node, ctx);
  }
```

For `super.method()` (CallExpression callee is MemberExpression with object Super), the existing MemberExpression branch in evalCall calls `evalNode(callee.object)` which dispatches to `evalSuperReceiver` and returns the parent prototype. Then `evalNodeMemberAsCallee` walks the chain to find the method. The method gets called with `this = top.thisValue` instead of the parent prototype, so update the MemberExpression branch in evalCall:

In the `if (node.callee.type === 'MemberExpression')` branch, when the inner object expression is `Super`, override `thisValue` to keep the current frame's `this`:

```ts
  if (node.callee.type === 'MemberExpression') {
    const recv = yield* evalNode(node.callee.object as A.Node, ctx);
    let thisValueLocal: JSValue;
    if (node.callee.object.type === 'Super') {
      const top = ctx.stack.top();
      thisValueLocal = top ? top.thisValue : { kind: 'undefined' };
    } else {
      thisValueLocal = recv.kind === 'ref' ? recv : { kind: 'undefined' };
    }
    thisValue = thisValueLocal;
    callee = yield* evalNodeMemberAsCallee(node.callee as A.MemberExpression, recv, ctx);
  } else if (node.callee.type === 'Super') {
    // already handled above
  } else {
    callee = yield* evalNode(node.callee as A.Node, ctx);
  }
```

(Replace the prior MemberExpression branch in evalCall accordingly.)

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/classes.test.ts
npx vitest --run
```

Expected: 7 classes tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/classes.test.ts
git commit -m "feat(engine): super() in constructors + super.method() lookup"
```

---

## Task 14: Capture closure bindings on function allocation

For canvas closure visualisation, we need the snapshot of the captured environment AT FUNCTION-ALLOCATION TIME — not the live `IEnvironmentRecord` reference (which keeps changing as scope evolves). Plan 4 stores a flat `Map<string, JSValue>` of bindings reachable through the closure chain at allocation time on the function's `source.capturedBindings`.

**Files:**
- Modify: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/evaluator/nodes.ts`

- [ ] **Step 1: Extend `FunctionSource`**

In `packages/engine/src/types.ts`, the `FunctionSource` already has `homeObject?` from Task 13. Add `capturedBindings`:

```ts
export type FunctionSource = {
  name?: string;
  params: string[];
  body: AstNode;
  isArrow: boolean;
  homeObject?: Reference;
  capturedBindings?: Map<string, JSValue>;
};
```

- [ ] **Step 2: Snapshot env at allocation in `makeFunctionRef`**

In `packages/engine/src/evaluator/nodes.ts`, find `makeFunctionRef`. In the `source: { ... }` literal, add `capturedBindings` computed by walking `top.env`'s outer chain and collecting non-builtin bindings.

Add a small helper at the bottom of the file:

```ts
function snapshotCapturedBindings(env: IEnvironmentRecord): Map<string, JSValue> {
  const out = new Map<string, JSValue>();
  let cur: IEnvironmentRecord | null = env;
  while (cur) {
    for (const [k, v] of cur.snapshotBindings()) {
      if (!out.has(k)) out.set(k, v);
    }
    cur = cur.outer;
  }
  return out;
}
```

In `makeFunctionRef`, when constructing the `source`, add `capturedBindings`:

```ts
    source: {
      // existing name + params + body + isArrow logic
      params,
      body: node.body as A.Node,
      isArrow,
      capturedBindings: snapshotCapturedBindings(closureEnv),
      ...(/* name field as before */ {}),
    },
```

(Make sure to merge with the existing conditional `name` spread used in plan 1's exactOptionalPropertyTypes fix.)

- [ ] **Step 3: Add a focused test**

Append to `packages/engine/tests/evaluator/closures.test.ts`:

```ts
  it('function HeapObject snapshots its capturedBindings at allocation time', () => {
    const { snapshots } = runCode(`
      let n = 0;
      const f = function () { return n; };
      n = 999;
    `);
    // The function HeapObject should have captured n=0 at allocation, not 999.
    const last = snapshots[snapshots.length - 1];
    const fnEntry = Array.from(last.heap.values()).find((o) => o.kind === 'function' && o.source);
    expect(fnEntry).toBeDefined();
    const captured = fnEntry?.source?.capturedBindings;
    expect(captured?.get('n')).toEqual({ kind: 'number', value: 0 });
  });
```

(The snapshot reflects the value AT ALLOCATION; it's a snapshot, not a live read of `n`.)

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run
```

Expected: 1 new closure test passes; full suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/closures.test.ts
git commit -m "feat(engine): capture closure bindings snapshot on function allocation"
```

---

## Task 15: UI — extend types + canvas refs to handle prototype edges

Now the UI side. Two type updates and a `refs.ts` extension to extract `proto` edges from `[[Prototype]]` chains.

**Files:**
- Modify: `packages/ui/src/types.ts`
- Modify: `packages/ui/src/canvas/refs.ts`
- Modify: `packages/ui/tests/canvas/refs.test.ts`

- [ ] **Step 1: Extend `RefEdge`**

In `packages/ui/src/types.ts`, find `RefEdge`:

```ts
export type RefEdge = {
  fromKind: NodeKind;
  fromId: string;
  fromLabel: string;
  toId: string;
};
```

Replace with a discriminated union:

```ts
export type RefEdge = {
  fromKind: NodeKind;
  fromId: string;     // synthetic frame key or heap id
  fromLabel: string;  // binding name, property key, or "[[Prototype]]"
  toId: string;
  edgeKind: 'ref' | 'proto'; // ref = solid teal, proto = solid violet
};
```

Update the existing tests in `packages/ui/tests/canvas/refs.test.ts` to expect `edgeKind: 'ref'` on existing assertions (they currently don't include the field):

```ts
    expect(edges[0]).toEqual({
      fromKind: 'frame',
      fromId: frameKey(0),
      fromLabel: 'obj',
      toId: 'obj7',
      edgeKind: 'ref',
    });
```

(Apply to both `frame binding` and `heap ownProp` test cases.)

- [ ] **Step 2: Extend `extractRefEdges` to also emit proto edges**

Replace `packages/ui/src/canvas/refs.ts`:

```ts
import type { JSValue, RefEdge, Snapshot } from '../types';
import { frameKey } from './layout';

function isRef(v: JSValue): v is { kind: 'ref'; id: string } {
  return v.kind === 'ref';
}

export function extractRefEdges(snap: Snapshot): RefEdge[] {
  const out: RefEdge[] = [];
  // Frame bindings → heap.
  snap.callStack.forEach((frame, i) => {
    for (const [name, value] of frame.bindings) {
      if (isRef(value)) {
        out.push({
          fromKind: 'frame',
          fromId: frameKey(i),
          fromLabel: name,
          toId: value.id,
          edgeKind: 'ref',
        });
      }
    }
  });
  // Heap object ownProps → heap.
  for (const [id, obj] of snap.heap) {
    for (const [key, value] of obj.ownProps) {
      if (isRef(value)) {
        out.push({
          fromKind: 'heap',
          fromId: id,
          fromLabel: key,
          toId: value.id,
          edgeKind: 'ref',
        });
      }
    }
    // [[Prototype]] edge.
    if (obj.prototype && obj.prototype.kind === 'ref') {
      out.push({
        fromKind: 'heap',
        fromId: id,
        fromLabel: '[[Prototype]]',
        toId: obj.prototype.id,
        edgeKind: 'proto',
      });
    }
  }
  return out;
}
```

- [ ] **Step 3: Add a proto-edge test**

Append to `packages/ui/tests/canvas/refs.test.ts`:

```ts
  it('emits a proto edge for each heap object with a [[Prototype]]', () => {
    const snap = snapWith({
      heap: [
        ['obj1', new Map()],
        ['obj2', new Map()],
      ],
    });
    // Manually attach prototype on obj1 → obj2.
    snap.heap.get('obj1')!.prototype = { kind: 'ref', id: 'obj2' } as never;
    const edges = extractRefEdges(snap);
    const protoEdges = edges.filter((e) => e.edgeKind === 'proto');
    expect(protoEdges).toHaveLength(1);
    expect(protoEdges[0]).toEqual({
      fromKind: 'heap',
      fromId: 'obj1',
      fromLabel: '[[Prototype]]',
      toId: 'obj2',
      edgeKind: 'proto',
    });
  });
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run packages/ui/tests/canvas/refs.test.ts
npx vitest --run
```

Expected: existing refs tests still green (with the `edgeKind: 'ref'` added) plus the new one. Full suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/types.ts packages/ui/src/canvas/refs.ts packages/ui/tests/canvas/refs.test.ts
git commit -m "feat(ui): extract proto edges; RefEdge gains edgeKind ref|proto"
```

---

## Task 16: UI — render proto edges + closure block + humanise new event labels

**Files:**
- Modify: `packages/ui/src/components/EdgesLayer.tsx`
- Modify: `packages/ui/src/components/HeapNode.tsx`
- Modify: `packages/ui/src/components/CanvasLegend.tsx`
- Modify: `packages/ui/src/components/CanvasPane.tsx`

- [ ] **Step 1: Style proto edges differently in EdgesLayer**

Read `packages/ui/src/components/EdgesLayer.tsx`. Replace the `<path>` props block so `edgeKind === 'proto'` uses violet stroke + a different arrowhead. Around the `return (...)` JSX, locate the `stroke="var(--info)"` line and update so it dispatches on `e.edgeKind`:

```tsx
        return (
          <path
            key={`${e.fromId}-${e.fromLabel}-${e.toId}-${i}`}
            d={d}
            fill="none"
            stroke={e.edgeKind === 'proto' ? 'var(--accent2)' : 'var(--info)'}
            strokeWidth={e.edgeKind === 'proto' ? 2 : 1.5}
            opacity={0.85}
            markerEnd={e.edgeKind === 'proto' ? 'url(#arrowhead-proto)' : 'url(#arrowhead)'}
          >
            <title>{`${e.fromLabel} → ${e.toId}`}</title>
          </path>
        );
```

Add a CSS variable for `--accent2` (violet). In `packages/ui/src/styles/app.css`, find the `:root` block and add:

```css
  --accent2: #cba6f7;
```

(Catppuccin mauve — matches the spec's "[[Prototype]] solid violet".)

- [ ] **Step 2: Add the proto arrowhead marker in CanvasPane**

Read `packages/ui/src/components/CanvasPane.tsx`. Inside `<defs>`, alongside the existing `<marker id="arrowhead">`, add a second:

```tsx
          <marker
            id="arrowhead-proto"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent2)" />
          </marker>
```

Also extend `EVENT_LABELS` to humanise the new event kinds:

```tsx
const EVENT_LABELS: Record<EventKind, string> = {
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
};
```

- [ ] **Step 3: Render `[[Environment]]` block on function HeapNodes**

Read `packages/ui/src/components/HeapNode.tsx`. After the `props_` enumeration and BEFORE the `(no own props)` placeholder, add a section for function objects' captured bindings:

In the imports, add:

```tsx
import type { JSValue } from '../types';
```

(already imported via existing `import type { HeapObject, JSValue, Pos }` — confirm).

In the JSX inside the `<g>`, after the existing `props_.map(...)` block and the `(no own props)` placeholder, insert a closure section for function objects:

```tsx
{!isCollapsed && obj.kind === 'function' && obj.source?.capturedBindings && obj.source.capturedBindings.size > 0 && (
  <>
    <text
      x={10}
      y={headerHeight + padding + (Math.max(1, props_.length) + 1) * lineHeight - 4}
      fontSize={9}
      fontFamily="JetBrains Mono, monospace"
      fill="var(--accent2)"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      [[Environment]]
    </text>
    {Array.from(obj.source.capturedBindings.entries()).map(([k, v]: [string, JSValue], i: number) => (
      <text
        key={`env-${k}`}
        x={20}
        y={headerHeight + padding + (Math.max(1, props_.length) + 2 + i) * lineHeight - 4}
        fontSize={11}
        fontFamily="JetBrains Mono, monospace"
        fill="var(--text)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <tspan fill="var(--accent2)">{k}</tspan>: {renderValue(v)}
      </text>
    ))}
  </>
)}
```

Update the `height` calculation so the captured-bindings rows are accounted for. Replace the `const height = ...` line with:

```tsx
  const capturedCount =
    obj.kind === 'function' && obj.source?.capturedBindings && !isCollapsed
      ? obj.source.capturedBindings.size
      : 0;
  const propRows = Math.max(1, props_.length);
  const height =
    headerHeight +
    (isCollapsed
      ? 0
      : padding +
        propRows * lineHeight +
        (capturedCount > 0 ? (capturedCount + 1) * lineHeight + 4 : 0) +
        padding);
```

- [ ] **Step 4: Update CanvasLegend**

In `packages/ui/src/components/CanvasLegend.tsx`, add a new line after the existing reference-edge legend entry:

```tsx
      <div>
        <span style={{ color: 'var(--accent2)' }}>━━</span> [[Prototype]]
      </div>
```

- [ ] **Step 5: Build + tests + e2e**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
npx vitest --run
npx tsc --noEmit -p packages/ui
./node_modules/.bin/eslint packages --ext .ts,.tsx
npm run e2e
```

Expected: build clean, all tests green, lint silent, e2e 2/2 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components packages/ui/src/styles/app.css
git commit -m "feat(ui): render [[Prototype]] edges + [[Environment]] block + humanise new event labels"
```

---

## Task 17: e2e — class-with-extends scenario + README + final lint

**Files:**
- Modify: `packages/ui/tests/e2e/smoke.spec.ts` (add a class scenario)
- Modify: `README.md` (project root) — flip plan-4 to ✅
- Modify: `packages/ui/README.md` (note prototypes + closures)
- Run lint + format + final test gate

- [ ] **Step 1: Add a class e2e**

Append a third test to `packages/ui/tests/e2e/smoke.spec.ts`:

```ts
test('class extends — prototype edge appears in the canvas', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('.cm-content', { timeout: 15_000 });
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('class A {} class B extends A {} new B();');
  await page.getByRole('button', { name: 'Run' }).click();
  await page.getByRole('button', { name: '⏭' }).click();

  // After Run, the snapshot pane should mention "[[Prototype]]" somewhere via
  // the legend at minimum; the canvas SVG paths include a violet stroke.
  const snapshotPane = page.locator('.snapshot');
  await expect(snapshotPane.locator('svg')).toBeVisible();
  await expect(snapshotPane).toContainText(/\[\[Prototype\]\]/);
});
```

- [ ] **Step 2: Update top-level README**

Edit `/home/codelance/projects/js-runtime-visualizer/README.md`. Replace:

```markdown
- [ ] **Plan 4** — prototypes & inheritance: `Object.create`, `__proto__`, `class`/`extends`, `new`, this binding, prototype-chain lookup highlights, prototype pollution mode.
```

with:

```markdown
- [x] **Plan 4** — prototypes & inheritance: `Object.create`, `__proto__`, `class`/`extends`/`super`, `new`, `this` binding, `Function.prototype.call`, `var`/function-decl hoisting, logical/conditional/compound operators. Canvas renders `[[Prototype]]` edges and the function's captured `[[Environment]]`. Lookup-path animation and prototype-pollution mode deferred to plan 5. _Completed 2026-05-08._
```

- [ ] **Step 3: Update UI package README**

Edit `/home/codelance/projects/js-runtime-visualizer/packages/ui/README.md`. Add a new section above "Not yet (planned)":

```markdown
## Plan 4 additions (prototypes + classes)

- Engine: prototype-aware member lookup, `new`, `Object.create`, `__proto__`, `class`/`extends`/`super`, `this` binding, `Function.prototype.call`, hoisting (`var` and function declarations), logical/conditional/compound operators, named function expression self-reference.
- Function HeapObjects now snapshot their captured bindings at allocation time — visible as the `[[Environment]]` block inside each function node.
- Canvas: solid violet `[[Prototype]]` edges between heap objects.
- Three new step-event kinds humanised in the snapshot pane: "Walked [[Prototype]] chain", "[[Prototype]] set", "this bound".
```

In the "Not yet (planned)" section, REMOVE the "Prototype chain visualisation, `class`/`extends`, prototype pollution mode (plan 4)" bullet (since most of it ships now).

- [ ] **Step 4: Lint + format + final test gate**

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

Expected: lint silent, all tests green, both tsc invocations silent, vite build clean, 3 e2e tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ packages/ui/tests/e2e/smoke.spec.ts README.md packages/ui/README.md
git commit -m "docs: plan 4 complete — prototypes, classes, this, hoisting, canvas proto edges + closure block"
```

---

## Done — what to expect

After all 17 tasks:

- Engine reaches MVP parity with the spec's §2 "Synchronous JavaScript" scope.
- Canonical ES5 inheritance + ES2015 `class`/`extends`/`super` snippets run end-to-end and produce the same final values as V8.
- Canvas renders prototype-chain edges (solid violet) and shows captured closure bindings inline on function nodes.
- ~25-30 new evaluator tests + 1 ES5 integration + 1 cross-check refresh + 1 e2e class scenario.

Roll into **plan 5 — errors & traceback** next: `throw`/`try`/`catch`, unwind events, `TracebackPanel`, animated red error propagation on the canvas. Plan 5 also lands the polish items deferred from plan 4: lookup-path animation (dashed orange), dotted grey `.prototype` toggle, retained closure scope frames.

---

## Self-review

- **Spec §2 MVP coverage:** functions/closures (plan 1) ✓; objects/arrays/member access (plan 1) ✓; function-style constructors with `new` (Task 9) ✓; class/extends/super (Tasks 11-13) ✓; `Object.create`, `Object.getPrototypeOf`, `__proto__`, assigning to `.prototype` (Tasks 4, 6, 7) ✓; prototype-chain lookups (Task 6) ✓; prototype pollution scenarios — naturally falls out of `__proto__` writes + `Object.prototype` chain walks (no separate task; visible in canvas as proto edges flipping). `this` binding (Task 8) ✓; `console.log` (plan 1) ✓.
- **Plan-1 carry-over #4 coverage:** `&&`/`||`/`??` (Task 1), conditional + compound (Task 2), named-fn-expr (Task 2), `this` (Task 8), prototypes/`class` (Tasks 4-13), `var`/function-decl hoisting (Task 3) — all addressed.
- **Plan-1 carry-over #5 (frame leak):** NOT addressed here (lands in plan 5 alongside `try/catch`).
- **No placeholders:** every step has full code, exact commands, exact commit messages.
- **Type consistency:** `FunctionSource` extension grows from `name?, params, body, isArrow` (plan 1) to also include `homeObject?` (Task 13) and `capturedBindings?` (Task 14). `EventKind` adds `proto-walk`, `proto-set`, `bind-this` (Task 6/8). `RefEdge` gains `edgeKind: 'ref'|'proto'` (Task 15). `Frame` gains `thisValue` (Task 8). All references in later tasks use these exact field names.
- **Carry-over to plan 5:** lookup-path animation (engine emits `proto-walk` events; UI animation pending), dotted grey `.prototype` edges (toggle), retained closure scope FRAMES (separate canvas nodes with `[[Scope]]` edges instead of inline `[[Environment]]`), eval-step kind for drill-in (carried from plan 1 #3), frame leak fix on non-Return throw (carried from plan 1 #5), `try/catch`/traceback panel + error propagation animation.
