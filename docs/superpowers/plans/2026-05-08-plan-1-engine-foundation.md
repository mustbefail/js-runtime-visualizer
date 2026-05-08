# Plan 1 — Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested, importable TypeScript engine library that parses JS, walks the AST as a generator-based interpreter, and produces a `Snapshot[]` array consumable by a future UI. This is plan 1 of 5; it covers the synchronous subset *without* prototypes or error handling — those come in plan 4 and plan 5.

**Architecture:** Pure TypeScript, no DOM. Acorn for parsing. Custom runtime model (Heap, EnvironmentRecord, Frame). Evaluator is a generator that yields a `StepEvent` per significant evaluation step. Outer runner pumps the generator, captures Immer-frozen snapshots into a `SnapshotStore`. Single public entry point `runCode(code, options): Snapshot[]`.

**Tech Stack:** Node 20+, TypeScript, Vitest, Acorn, Immer, ESLint, Prettier.

**Reference spec:** [`docs/superpowers/specs/2026-05-08-js-execution-visualizer-design.md`](../specs/2026-05-08-js-execution-visualizer-design.md)

---

## File structure (created by this plan)

```
js-runtime-visualizer/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── packages/
│   └── engine/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts                  ← public API
│       │   ├── parser.ts                 ← Acorn wrapper
│       │   ├── events.ts                 ← StepEvent type
│       │   ├── runtime/
│       │   │   ├── model.ts              ← JSValue, HeapObject types
│       │   │   ├── heap.ts               ← allocate / get / set
│       │   │   ├── env.ts                ← EnvironmentRecord
│       │   │   ├── frames.ts             ← Frame, CallStack
│       │   │   └── builtins.ts           ← console, global env seeding
│       │   ├── evaluator/
│       │   │   ├── index.ts              ← evaluator entry, runner
│       │   │   ├── nodes.ts              ← per-node eval functions
│       │   │   └── values.ts             ← Primitive helpers, ToBoolean, ToString
│       │   └── snapshot.ts               ← SnapshotStore, Immer wrapping
│       └── tests/
│           ├── parser.test.ts
│           ├── heap.test.ts
│           ├── env.test.ts
│           ├── snapshot.test.ts
│           ├── evaluator/
│           │   ├── literals.test.ts
│           │   ├── variables.test.ts
│           │   ├── control-flow.test.ts
│           │   ├── functions.test.ts
│           │   ├── closures.test.ts
│           │   ├── objects.test.ts
│           │   └── console.test.ts
│           └── integration.test.ts
```

Workspace structure (`packages/engine`) leaves room for `packages/ui` in plan 2 without a refactor.

---

## Conventions used throughout this plan

- Every code change is preceded by a failing test; minimal code is written to pass; we commit per task.
- Test commands always use `--run` to avoid Vitest's watch mode hanging in CI/agent contexts.
- All paths are relative to the repository root `/home/codelance/projects/js-runtime-visualizer`.
- Commits use conventional-commit prefixes: `chore:`, `feat:`, `test:`, `fix:`.

---

## Task 1: Bootstrap workspace

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `.gitignore` (extend), `packages/engine/package.json`, `packages/engine/tsconfig.json`

- [ ] **Step 1: Initialise root package.json**

Create `/home/codelance/projects/js-runtime-visualizer/package.json`:

```json
{
  "name": "js-runtime-visualizer",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "vitest --run",
    "test:watch": "vitest",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@typescript-eslint/eslint-plugin": "^6.21.0",
    "@typescript-eslint/parser": "^6.21.0",
    "eslint": "^8.57.0",
    "prettier": "^3.2.5",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Root tsconfig.json**

Create `/home/codelance/projects/js-runtime-visualizer/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["packages/*/src/**/*", "packages/*/tests/**/*"]
}
```

- [ ] **Step 3: vitest.config.ts**

Create `/home/codelance/projects/js-runtime-visualizer/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
```

- [ ] **Step 4: ESLint + Prettier config**

Create `/home/codelance/projects/js-runtime-visualizer/.eslintrc.cjs`:

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    'no-console': 'off',
  },
};
```

Create `/home/codelance/projects/js-runtime-visualizer/.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 5: Update .gitignore**

Append to existing `/home/codelance/projects/js-runtime-visualizer/.gitignore`:

```
node_modules/
dist/
coverage/
*.log
.DS_Store
```

- [ ] **Step 6: Engine package**

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/package.json`:

```json
{
  "name": "@js-runtime-visualizer/engine",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "acorn": "^8.11.3",
    "immer": "^10.0.4"
  }
}
```

Create `/home/codelance/projects/js-runtime-visualizer/packages/engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 7: Install and verify**

Run from `/home/codelance/projects/js-runtime-visualizer`:

```bash
npm install
npx vitest --run
```

Expected: install succeeds; vitest exits with "No test files found" or similar (zero tests is OK).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: bootstrap workspace + engine package"
```

---

## Task 2: Parser wrapper

**Files:**
- Create: `packages/engine/src/parser.ts`
- Create: `packages/engine/tests/parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser';

describe('parse', () => {
  it('returns ok=true with an AST for valid code', () => {
    const result = parse('let x = 1;');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ast.type).toBe('Program');
      expect(result.ast.body).toHaveLength(1);
      expect(result.ast.body[0].type).toBe('VariableDeclaration');
    }
  });

  it('returns ok=false with line/col for syntax errors', () => {
    const result = parse('let x =;');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/unexpected/i);
      expect(result.error.line).toBe(1);
      expect(typeof result.error.col).toBe('number');
    }
  });

  it('preserves source locations on every node', () => {
    const result = parse('const a = 1;\nconst b = 2;');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const second = result.ast.body[1];
      expect(second.loc?.start.line).toBe(2);
    }
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx vitest --run packages/engine/tests/parser.test.ts
```

Expected: FAIL with "Cannot find module '../src/parser'".

- [ ] **Step 3: Implement parser**

Create `packages/engine/src/parser.ts`:

```ts
import * as acorn from 'acorn';
import type { Program } from 'acorn';

export type ParseResult =
  | { ok: true; ast: Program }
  | { ok: false; error: { message: string; line: number; col: number } };

export function parse(code: string): ParseResult {
  try {
    const ast = acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'script',
      locations: true,
    }) as Program;
    return { ok: true, ast };
  } catch (e: unknown) {
    if (e instanceof SyntaxError && 'loc' in e) {
      const loc = (e as SyntaxError & { loc: { line: number; column: number } }).loc;
      return {
        ok: false,
        error: { message: e.message, line: loc.line, col: loc.column },
      };
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/parser.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/parser.ts packages/engine/tests/parser.test.ts
git commit -m "feat(engine): parser wrapper around acorn with structured errors"
```

---

## Task 3: Heap module

**Files:**
- Create: `packages/engine/src/runtime/model.ts`
- Create: `packages/engine/src/runtime/heap.ts`
- Create: `packages/engine/tests/heap.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/heap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Heap } from '../src/runtime/heap';

describe('Heap', () => {
  it('allocates objects with unique ids', () => {
    const heap = new Heap();
    const a = heap.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    const b = heap.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    expect(a.id).not.toBe(b.id);
    expect(heap.get(a.id)?.kind).toBe('object');
  });

  it('returns undefined for missing ids', () => {
    const heap = new Heap();
    expect(heap.get('missing')).toBeUndefined();
  });

  it('mutates own props through update', () => {
    const heap = new Heap();
    const ref = heap.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    heap.setProp(ref.id, 'name', 'Rex');
    expect(heap.get(ref.id)?.ownProps.get('name')).toBe('Rex');
  });

  it('iterates all live objects', () => {
    const heap = new Heap();
    heap.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    heap.allocate({ kind: 'array', ownProps: new Map(), prototype: null });
    expect(heap.size()).toBe(2);
    const kinds = [...heap.entries()].map(([, o]) => o.kind);
    expect(kinds.sort()).toEqual(['array', 'object']);
  });
});
```

- [ ] **Step 2: Define types**

Create `packages/engine/src/runtime/model.ts`:

```ts
export type Primitive =
  | { kind: 'undefined' }
  | { kind: 'null' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string };

export type Reference = { kind: 'ref'; id: string };

export type JSValue = Primitive | Reference;

export type SourceLoc = { line: number; col: number };

export type HeapObject = {
  kind: 'object' | 'array' | 'function';
  ownProps: Map<string, JSValue>;
  prototype: Reference | null;
  // function-only:
  closure?: import('./env').EnvironmentRecord;
  source?: { name?: string; params: string[]; bodyAstId: string };
};

// Constructors for common JSValues
export const u = (): Primitive => ({ kind: 'undefined' });
export const nul = (): Primitive => ({ kind: 'null' });
export const num = (n: number): Primitive => ({ kind: 'number', value: n });
export const str = (s: string): Primitive => ({ kind: 'string', value: s });
export const bool = (b: boolean): Primitive => ({ kind: 'boolean', value: b });
```

- [ ] **Step 3: Implement Heap**

Create `packages/engine/src/runtime/heap.ts`:

```ts
import type { HeapObject, JSValue, Reference } from './model';

let nextId = 1;
const freshId = () => `obj${nextId++}`;

export class Heap {
  private store = new Map<string, HeapObject>();

  allocate(obj: HeapObject): Reference {
    const id = freshId();
    this.store.set(id, obj);
    return { kind: 'ref', id };
  }

  get(id: string): HeapObject | undefined {
    return this.store.get(id);
  }

  setProp(id: string, key: string, value: JSValue): void {
    const obj = this.store.get(id);
    if (!obj) throw new Error(`heap: no object with id ${id}`);
    obj.ownProps.set(key, value);
  }

  size(): number {
    return this.store.size;
  }

  entries(): IterableIterator<[string, HeapObject]> {
    return this.store.entries();
  }

  // Used by snapshot module to clone. Returns a new Map with shallow object copies.
  snapshot(): Map<string, HeapObject> {
    const out = new Map<string, HeapObject>();
    for (const [id, obj] of this.store) {
      out.set(id, {
        ...obj,
        ownProps: new Map(obj.ownProps),
      });
    }
    return out;
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/heap.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/runtime/model.ts packages/engine/src/runtime/heap.ts packages/engine/tests/heap.test.ts
git commit -m "feat(engine): heap module with allocate/get/setProp"
```

---

## Task 4: EnvironmentRecord and Frames

**Files:**
- Create: `packages/engine/src/runtime/env.ts`
- Create: `packages/engine/src/runtime/frames.ts`
- Create: `packages/engine/tests/env.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EnvironmentRecord } from '../src/runtime/env';
import { num, u } from '../src/runtime/model';

describe('EnvironmentRecord', () => {
  it('defines and reads a binding in the current scope', () => {
    const env = new EnvironmentRecord(null);
    env.define('x', num(42), 'let');
    expect(env.lookup('x')).toEqual(num(42));
  });

  it('walks outer chain on lookup', () => {
    const outer = new EnvironmentRecord(null);
    outer.define('x', num(1), 'const');
    const inner = new EnvironmentRecord(outer);
    expect(inner.lookup('x')).toEqual(num(1));
  });

  it('returns undefined sentinel when var lookup misses', () => {
    const env = new EnvironmentRecord(null);
    expect(env.lookup('nope')).toEqual(u());
  });

  it('rejects redeclaration of let in same scope', () => {
    const env = new EnvironmentRecord(null);
    env.define('x', num(1), 'let');
    expect(() => env.define('x', num(2), 'let')).toThrow(/already declared/i);
  });

  it('refuses to assign to const', () => {
    const env = new EnvironmentRecord(null);
    env.define('x', num(1), 'const');
    expect(() => env.assign('x', num(2))).toThrow(/const/i);
  });

  it('assigns to let in outer scope when inner does not have it', () => {
    const outer = new EnvironmentRecord(null);
    outer.define('x', num(1), 'let');
    const inner = new EnvironmentRecord(outer);
    inner.assign('x', num(2));
    expect(outer.lookup('x')).toEqual(num(2));
  });
});
```

- [ ] **Step 2: Implement EnvironmentRecord**

Create `packages/engine/src/runtime/env.ts`:

```ts
import { type JSValue, u } from './model';

export type BindingKind = 'let' | 'const' | 'var';

type Binding = { value: JSValue; kind: BindingKind };

export class EnvironmentRecord {
  private bindings = new Map<string, Binding>();
  constructor(public outer: EnvironmentRecord | null) {}

  define(name: string, value: JSValue, kind: BindingKind): void {
    if (this.bindings.has(name)) {
      throw new Error(`SyntaxError: '${name}' has already been declared`);
    }
    this.bindings.set(name, { value, kind });
  }

  lookup(name: string): JSValue {
    const here = this.bindings.get(name);
    if (here) return here.value;
    if (this.outer) return this.outer.lookup(name);
    return u();
  }

  has(name: string): boolean {
    if (this.bindings.has(name)) return true;
    return this.outer ? this.outer.has(name) : false;
  }

  assign(name: string, value: JSValue): void {
    const here = this.bindings.get(name);
    if (here) {
      if (here.kind === 'const') {
        throw new Error(`TypeError: Assignment to constant variable '${name}'`);
      }
      here.value = value;
      return;
    }
    if (this.outer) {
      this.outer.assign(name, value);
      return;
    }
    throw new Error(`ReferenceError: ${name} is not defined`);
  }

  // Snapshot a shallow copy of bindings for time-travel rendering.
  snapshotBindings(): Map<string, JSValue> {
    const out = new Map<string, JSValue>();
    for (const [k, v] of this.bindings) out.set(k, v.value);
    return out;
  }
}
```

- [ ] **Step 3: Implement Frame type**

Create `packages/engine/src/runtime/frames.ts`:

```ts
import type { EnvironmentRecord } from './env';
import type { Reference, SourceLoc } from './model';

export type Frame = {
  fn: Reference | 'global';
  fnName: string;
  env: EnvironmentRecord;
  callSite: SourceLoc | null;
};

export class CallStack {
  private frames: Frame[] = [];

  push(frame: Frame): void {
    this.frames.push(frame);
  }

  pop(): Frame | undefined {
    return this.frames.pop();
  }

  top(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }

  size(): number {
    return this.frames.length;
  }

  snapshot(): Frame[] {
    // shallow copy; env objects shared but bindings re-snapshotted by snapshot module
    return this.frames.map((f) => ({ ...f }));
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/env.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/runtime/env.ts packages/engine/src/runtime/frames.ts packages/engine/tests/env.test.ts
git commit -m "feat(engine): EnvironmentRecord with let/const/var + CallStack"
```

---

## Task 5: SnapshotStore + StepEvent

**Files:**
- Create: `packages/engine/src/events.ts`
- Create: `packages/engine/src/snapshot.ts`
- Create: `packages/engine/tests/snapshot.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/snapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Heap } from '../src/runtime/heap';
import { CallStack } from '../src/runtime/frames';
import { EnvironmentRecord } from '../src/runtime/env';
import { num } from '../src/runtime/model';
import { SnapshotStore } from '../src/snapshot';

describe('SnapshotStore', () => {
  it('captures heap and call stack at the moment of capture', () => {
    const heap = new Heap();
    const stack = new CallStack();
    const env = new EnvironmentRecord(null);
    env.define('x', num(1), 'let');
    stack.push({ fn: 'global', fnName: '<global>', env, callSite: null });

    const store = new SnapshotStore();
    store.capture({
      eventKind: 'enter-frame',
      loc: { line: 1, col: 0 },
      heap,
      stack,
      consoleOut: [],
      highlights: {},
    });

    expect(store.length()).toBe(1);
    const snap = store.at(0);
    expect(snap.callStack[0].fnName).toBe('<global>');
  });

  it('returns immutable snapshots — later mutation does not affect captured state', () => {
    const heap = new Heap();
    const ref = heap.allocate({ kind: 'object', ownProps: new Map([['n', num(1)]]), prototype: null });
    const stack = new CallStack();

    const store = new SnapshotStore();
    store.capture({
      eventKind: 'allocate',
      loc: { line: 1, col: 0 },
      heap,
      stack,
      consoleOut: [],
      highlights: {},
    });

    heap.setProp(ref.id, 'n', num(999));

    const snapped = store.at(0).heap.get(ref.id);
    expect(snapped?.ownProps.get('n')).toEqual(num(1));
  });

  it('records steps in order with monotonic indices', () => {
    const store = new SnapshotStore();
    const heap = new Heap();
    const stack = new CallStack();
    for (let i = 0; i < 3; i++) {
      store.capture({
        eventKind: 'assign',
        loc: { line: i + 1, col: 0 },
        heap,
        stack,
        consoleOut: [],
        highlights: {},
      });
    }
    expect(store.at(0).step).toBe(0);
    expect(store.at(2).step).toBe(2);
  });
});
```

- [ ] **Step 2: Implement events**

Create `packages/engine/src/events.ts`:

```ts
import type { SourceLoc } from './runtime/model';

export type EventKind =
  | 'enter-frame'
  | 'leave-frame'
  | 'assign'
  | 'allocate'
  | 'lookup'
  | 'mutate'
  | 'console';

export type StepEvent = {
  kind: EventKind;
  loc: SourceLoc;
  payload?: Record<string, unknown>;
};
```

- [ ] **Step 3: Implement SnapshotStore**

Create `packages/engine/src/snapshot.ts`:

```ts
import { produce, freeze } from 'immer';
import type { EventKind } from './events';
import type { Heap } from './runtime/heap';
import type { CallStack } from './runtime/frames';
import type { HeapObject, SourceLoc, JSValue } from './runtime/model';

export type FrameSnapshot = {
  fnName: string;
  callSite: SourceLoc | null;
  bindings: Map<string, JSValue>;
};

export type Snapshot = {
  step: number;
  loc: SourceLoc;
  eventKind: EventKind;
  callStack: FrameSnapshot[];
  heap: Map<string, HeapObject>;
  consoleOut: string[];
  highlights: { lookupPath?: string[]; changedIds?: string[]; activeFrame?: number };
};

export type CaptureInput = {
  eventKind: EventKind;
  loc: SourceLoc;
  heap: Heap;
  stack: CallStack;
  consoleOut: string[];
  highlights: Snapshot['highlights'];
};

export class SnapshotStore {
  private snaps: Snapshot[] = [];

  capture(input: CaptureInput): void {
    const callStack: FrameSnapshot[] = input.stack.snapshot().map((f) => ({
      fnName: f.fnName,
      callSite: f.callSite,
      bindings: f.env.snapshotBindings(),
    }));
    const heap = input.heap.snapshot();
    const snap: Snapshot = freeze(
      produce<Snapshot>(
        {
          step: this.snaps.length,
          loc: input.loc,
          eventKind: input.eventKind,
          callStack,
          heap,
          consoleOut: [...input.consoleOut],
          highlights: input.highlights,
        },
        () => {},
      ),
      true,
    );
    this.snaps.push(snap);
  }

  length(): number {
    return this.snaps.length;
  }

  at(i: number): Snapshot {
    const s = this.snaps[i];
    if (!s) throw new Error(`SnapshotStore: out of range ${i}`);
    return s;
  }

  all(): Snapshot[] {
    return this.snaps;
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/snapshot.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/events.ts packages/engine/src/snapshot.ts packages/engine/tests/snapshot.test.ts
git commit -m "feat(engine): SnapshotStore with Immer-frozen snapshots"
```

---

## Task 6: Evaluator skeleton + literals

**Files:**
- Create: `packages/engine/src/evaluator/values.ts`
- Create: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/src/evaluator/index.ts`
- Create: `packages/engine/tests/evaluator/literals.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/evaluator/literals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — literals and arithmetic', () => {
  it('evaluates a numeric literal expression', () => {
    const { snapshots, finalValue } = runCode('1;');
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it('evaluates a string literal', () => {
    const { finalValue } = runCode('"hello";');
    expect(finalValue).toEqual({ kind: 'string', value: 'hello' });
  });

  it('evaluates boolean literals', () => {
    expect(runCode('true;').finalValue).toEqual({ kind: 'boolean', value: true });
    expect(runCode('false;').finalValue).toEqual({ kind: 'boolean', value: false });
  });

  it('evaluates null and undefined', () => {
    expect(runCode('null;').finalValue).toEqual({ kind: 'null' });
    expect(runCode('undefined;').finalValue).toEqual({ kind: 'undefined' });
  });

  it('evaluates binary arithmetic', () => {
    expect(runCode('1 + 2;').finalValue).toEqual({ kind: 'number', value: 3 });
    expect(runCode('10 - 4;').finalValue).toEqual({ kind: 'number', value: 6 });
    expect(runCode('3 * 4;').finalValue).toEqual({ kind: 'number', value: 12 });
    expect(runCode('20 / 5;').finalValue).toEqual({ kind: 'number', value: 4 });
  });

  it('respects operator precedence', () => {
    expect(runCode('1 + 2 * 3;').finalValue).toEqual({ kind: 'number', value: 7 });
  });

  it('supports unary minus and not', () => {
    expect(runCode('-5;').finalValue).toEqual({ kind: 'number', value: -5 });
    expect(runCode('!true;').finalValue).toEqual({ kind: 'boolean', value: false });
  });
});
```

- [ ] **Step 2: Implement value helpers**

Create `packages/engine/src/evaluator/values.ts`:

```ts
import { type JSValue, type Primitive, num, str, bool, u, nul } from '../runtime/model';

export function fromJsLiteral(v: unknown): Primitive {
  if (v === null) return nul();
  if (typeof v === 'undefined') return u();
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string') return str(v);
  if (typeof v === 'boolean') return bool(v);
  throw new Error(`fromJsLiteral: unsupported literal ${String(v)}`);
}

export function toBoolean(v: JSValue): boolean {
  switch (v.kind) {
    case 'undefined':
    case 'null':
      return false;
    case 'boolean':
      return v.value;
    case 'number':
      return v.value !== 0 && !Number.isNaN(v.value);
    case 'string':
      return v.value.length > 0;
    case 'ref':
      return true;
  }
}

export function toNumber(v: JSValue): number {
  switch (v.kind) {
    case 'undefined':
      return Number.NaN;
    case 'null':
      return 0;
    case 'boolean':
      return v.value ? 1 : 0;
    case 'number':
      return v.value;
    case 'string':
      return v.value.trim() === '' ? 0 : Number(v.value);
    case 'ref':
      return Number.NaN;
  }
}

export function isPrimitive(v: JSValue): v is Primitive {
  return v.kind !== 'ref';
}
```

- [ ] **Step 3: Implement node evaluator (literals + binary + unary)**

Create `packages/engine/src/evaluator/nodes.ts`:

```ts
import type * as A from 'acorn';
import { type JSValue, num, bool } from '../runtime/model';
import { fromJsLiteral, toBoolean, toNumber } from './values';
import type { Context } from './index';
import type { StepEvent } from '../events';

export function* evalNode(node: A.Node, ctx: Context): Generator<StepEvent, JSValue> {
  switch (node.type) {
    case 'Program':
      return yield* evalProgram(node as A.Program, ctx);
    case 'ExpressionStatement':
      return yield* evalNode((node as A.ExpressionStatement).expression, ctx);
    case 'Literal':
      return fromJsLiteral((node as A.Literal).value);
    case 'Identifier': {
      const name = (node as A.Identifier).name;
      if (name === 'undefined') return { kind: 'undefined' };
      throw new Error(`Identifier '${name}' not yet supported (Task 8 will add bindings)`);
    }
    case 'BinaryExpression':
      return yield* evalBinary(node as A.BinaryExpression, ctx);
    case 'UnaryExpression':
      return yield* evalUnary(node as A.UnaryExpression, ctx);
    default:
      throw new Error(`UnsupportedError: AST node ${node.type} not implemented in plan 1`);
  }
}

function* evalProgram(node: A.Program, ctx: Context): Generator<StepEvent, JSValue> {
  let last: JSValue = { kind: 'undefined' };
  for (const stmt of node.body) {
    last = yield* evalNode(stmt, ctx);
  }
  return last;
}

function* evalBinary(node: A.BinaryExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const left = yield* evalNode(node.left, ctx);
  const right = yield* evalNode(node.right, ctx);
  switch (node.operator) {
    case '+': {
      if (left.kind === 'string' || right.kind === 'string') {
        return { kind: 'string', value: stringify(left) + stringify(right) };
      }
      return num(toNumber(left) + toNumber(right));
    }
    case '-':
      return num(toNumber(left) - toNumber(right));
    case '*':
      return num(toNumber(left) * toNumber(right));
    case '/':
      return num(toNumber(left) / toNumber(right));
    case '%':
      return num(toNumber(left) % toNumber(right));
    case '===':
      return bool(strictEqual(left, right));
    case '!==':
      return bool(!strictEqual(left, right));
    case '<':
      return bool(toNumber(left) < toNumber(right));
    case '>':
      return bool(toNumber(left) > toNumber(right));
    case '<=':
      return bool(toNumber(left) <= toNumber(right));
    case '>=':
      return bool(toNumber(left) >= toNumber(right));
    default:
      throw new Error(`Operator ${node.operator} not supported in plan 1`);
  }
}

function* evalUnary(node: A.UnaryExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const arg = yield* evalNode(node.argument, ctx);
  switch (node.operator) {
    case '-':
      return num(-toNumber(arg));
    case '+':
      return num(toNumber(arg));
    case '!':
      return bool(!toBoolean(arg));
    case 'typeof':
      return { kind: 'string', value: typeOf(arg) };
    default:
      throw new Error(`Unary ${node.operator} not supported in plan 1`);
  }
}

function strictEqual(a: JSValue, b: JSValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'ref' && b.kind === 'ref') return a.id === b.id;
  if ('value' in a && 'value' in b) return a.value === b.value;
  return true;
}

function stringify(v: JSValue): string {
  switch (v.kind) {
    case 'undefined':
      return 'undefined';
    case 'null':
      return 'null';
    case 'boolean':
      return String(v.value);
    case 'number':
      return String(v.value);
    case 'string':
      return v.value;
    case 'ref':
      return '[object]';
  }
}

function typeOf(v: JSValue): string {
  switch (v.kind) {
    case 'undefined':
      return 'undefined';
    case 'null':
      return 'object';
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'ref':
      return 'object';
  }
}
```

- [ ] **Step 4: Implement evaluator entry + runner**

Create `packages/engine/src/evaluator/index.ts`:

```ts
import { parse } from '../parser';
import { Heap } from '../runtime/heap';
import { CallStack } from '../runtime/frames';
import { EnvironmentRecord } from '../runtime/env';
import { SnapshotStore, type Snapshot } from '../snapshot';
import type { JSValue, SourceLoc } from '../runtime/model';
import type { StepEvent } from '../events';
import { evalNode } from './nodes';

export type Context = {
  heap: Heap;
  stack: CallStack;
  globalEnv: EnvironmentRecord;
  consoleOut: string[];
  drillIn: boolean;
};

export type RunOptions = { drillIn?: boolean };

export type RunResult = {
  snapshots: Snapshot[];
  finalValue: JSValue;
};

export function runCode(code: string, options: RunOptions = {}): RunResult {
  const parsed = parse(code);
  if (!parsed.ok) {
    throw new Error(`Parse error: ${parsed.error.message} at ${parsed.error.line}:${parsed.error.col}`);
  }

  const heap = new Heap();
  const stack = new CallStack();
  const globalEnv = new EnvironmentRecord(null);
  const ctx: Context = {
    heap,
    stack,
    globalEnv,
    consoleOut: [],
    drillIn: options.drillIn ?? false,
  };

  stack.push({ fn: 'global', fnName: '<global>', env: globalEnv, callSite: null });

  const store = new SnapshotStore();
  const initialLoc: SourceLoc = { line: 1, col: 0 };
  store.capture({
    eventKind: 'enter-frame',
    loc: initialLoc,
    heap,
    stack,
    consoleOut: ctx.consoleOut,
    highlights: { activeFrame: 0 },
  });

  const gen = evalNode(parsed.ast, ctx);
  let last: JSValue = { kind: 'undefined' };
  while (true) {
    const step = gen.next();
    if (step.done) {
      last = step.value;
      break;
    }
    const event: StepEvent = step.value;
    store.capture({
      eventKind: event.kind,
      loc: event.loc,
      heap,
      stack,
      consoleOut: ctx.consoleOut,
      highlights: {},
    });
  }

  return { snapshots: store.all(), finalValue: last };
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/literals.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/evaluator packages/engine/tests/evaluator/literals.test.ts
git commit -m "feat(engine): evaluator skeleton with literals and arithmetic"
```

---

## Task 7: Variable declarations + identifiers + assignment

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/variables.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/evaluator/variables.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — variables and assignment', () => {
  it('declares and reads a let binding', () => {
    const { finalValue } = runCode('let x = 7; x;');
    expect(finalValue).toEqual({ kind: 'number', value: 7 });
  });

  it('reassigns a let', () => {
    const { finalValue } = runCode('let x = 1; x = 2; x;');
    expect(finalValue).toEqual({ kind: 'number', value: 2 });
  });

  it('rejects assignment to const', () => {
    expect(() => runCode('const x = 1; x = 2;')).toThrow(/const/i);
  });

  it('emits assign events', () => {
    const { snapshots } = runCode('let x = 1; x = 2;');
    const kinds = snapshots.map((s) => s.eventKind);
    expect(kinds).toContain('assign');
  });

  it('throws ReferenceError for undeclared identifier', () => {
    expect(() => runCode('y;')).toThrow(/y is not defined/i);
  });
});
```

- [ ] **Step 2: Extend evaluator**

In `packages/engine/src/evaluator/nodes.ts`, replace the `Identifier` case and add new cases. Update the switch in `evalNode`:

```ts
    case 'Identifier': {
      const name = (node as A.Identifier).name;
      if (name === 'undefined') return { kind: 'undefined' };
      const env = ctx.stack.top()!.env;
      if (!env.has(name)) {
        throw new Error(`ReferenceError: ${name} is not defined`);
      }
      const value = env.lookup(name);
      yield { kind: 'lookup', loc: locOf(node), payload: { name } };
      return value;
    }
    case 'VariableDeclaration':
      return yield* evalVarDecl(node as A.VariableDeclaration, ctx);
    case 'AssignmentExpression':
      return yield* evalAssign(node as A.AssignmentExpression, ctx);
```

Add the two new functions and a `locOf` helper at the bottom of the file:

```ts
function* evalVarDecl(node: A.VariableDeclaration, ctx: Context): Generator<StepEvent, JSValue> {
  const kind = node.kind as 'let' | 'const' | 'var';
  for (const decl of node.declarations) {
    const id = decl.id as A.Identifier;
    const value: JSValue = decl.init
      ? yield* evalNode(decl.init, ctx)
      : { kind: 'undefined' };
    ctx.stack.top()!.env.define(id.name, value, kind);
    yield { kind: 'assign', loc: locOf(node), payload: { name: id.name, kind } };
  }
  return { kind: 'undefined' };
}

function* evalAssign(node: A.AssignmentExpression, ctx: Context): Generator<StepEvent, JSValue> {
  if (node.operator !== '=') {
    throw new Error(`Compound assignment ${node.operator} not yet supported`);
  }
  const target = node.left as A.Identifier;
  const value = yield* evalNode(node.right, ctx);
  ctx.stack.top()!.env.assign(target.name, value);
  yield { kind: 'assign', loc: locOf(node), payload: { name: target.name } };
  return value;
}

function locOf(node: A.Node): { line: number; col: number } {
  return { line: node.loc?.start.line ?? 0, col: node.loc?.start.column ?? 0 };
}
```

Also add `Identifier` import note: ensure `evalNode` switch keeps the new cases above `default`.

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/variables.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/variables.test.ts
git commit -m "feat(engine): variable declarations and assignment"
```

---

## Task 8: Control flow — if / while / for / blocks

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/control-flow.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/evaluator/control-flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — control flow', () => {
  it('takes the then branch', () => {
    const { finalValue } = runCode('let x = 0; if (true) x = 1; else x = 2; x;');
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });

  it('takes the else branch', () => {
    const { finalValue } = runCode('let x = 0; if (false) x = 1; else x = 2; x;');
    expect(finalValue).toEqual({ kind: 'number', value: 2 });
  });

  it('runs while loop until false', () => {
    const { finalValue } = runCode('let i = 0; while (i < 3) i = i + 1; i;');
    expect(finalValue).toEqual({ kind: 'number', value: 3 });
  });

  it('runs for loop with init/test/update', () => {
    const { finalValue } = runCode('let s = 0; for (let i = 1; i <= 3; i = i + 1) s = s + i; s;');
    expect(finalValue).toEqual({ kind: 'number', value: 6 });
  });

  it('introduces a fresh block scope for let inside { }', () => {
    const { finalValue } = runCode('let x = 1; { let x = 2; } x;');
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });
});
```

- [ ] **Step 2: Extend evaluator**

Add cases in `evalNode` switch:

```ts
    case 'BlockStatement':
      return yield* evalBlock(node as A.BlockStatement, ctx);
    case 'IfStatement':
      return yield* evalIf(node as A.IfStatement, ctx);
    case 'WhileStatement':
      return yield* evalWhile(node as A.WhileStatement, ctx);
    case 'ForStatement':
      return yield* evalFor(node as A.ForStatement, ctx);
```

Add helpers:

```ts
import { EnvironmentRecord } from '../runtime/env';

function* evalBlock(node: A.BlockStatement, ctx: Context): Generator<StepEvent, JSValue> {
  const top = ctx.stack.top()!;
  const blockEnv = new EnvironmentRecord(top.env);
  const saved = top.env;
  top.env = blockEnv;
  let last: JSValue = { kind: 'undefined' };
  try {
    for (const stmt of node.body) last = yield* evalNode(stmt, ctx);
  } finally {
    top.env = saved;
  }
  return last;
}

function* evalIf(node: A.IfStatement, ctx: Context): Generator<StepEvent, JSValue> {
  const test = yield* evalNode(node.test, ctx);
  if (toBoolean(test)) return yield* evalNode(node.consequent, ctx);
  if (node.alternate) return yield* evalNode(node.alternate, ctx);
  return { kind: 'undefined' };
}

function* evalWhile(node: A.WhileStatement, ctx: Context): Generator<StepEvent, JSValue> {
  while (toBoolean(yield* evalNode(node.test, ctx))) {
    yield* evalNode(node.body, ctx);
  }
  return { kind: 'undefined' };
}

function* evalFor(node: A.ForStatement, ctx: Context): Generator<StepEvent, JSValue> {
  const top = ctx.stack.top()!;
  const forEnv = new EnvironmentRecord(top.env);
  const saved = top.env;
  top.env = forEnv;
  try {
    if (node.init) yield* evalNode(node.init, ctx);
    while (node.test ? toBoolean(yield* evalNode(node.test, ctx)) : true) {
      yield* evalNode(node.body, ctx);
      if (node.update) yield* evalNode(node.update, ctx);
    }
  } finally {
    top.env = saved;
  }
  return { kind: 'undefined' };
}
```

To use `top.env = blockEnv`, the `Frame.env` field must be writable. It already is (`env: EnvironmentRecord`) — verify in `frames.ts`.

Also export `EnvironmentRecord` is already done. No type changes needed.

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/control-flow.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/control-flow.test.ts
git commit -m "feat(engine): if / while / for / block statements"
```

---

## Task 9: Functions and closures

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Modify: `packages/engine/src/runtime/model.ts` (function source includes body AST node directly)
- Create: `packages/engine/tests/evaluator/functions.test.ts`
- Create: `packages/engine/tests/evaluator/closures.test.ts`

- [ ] **Step 1: Adjust HeapObject to store function body as AST node**

In `packages/engine/src/runtime/model.ts`, replace `source?: { name?: string; params: string[]; bodyAstId: string };` with:

```ts
  source?: {
    name?: string;
    params: string[];
    body: import('acorn').Node;
    isArrow: boolean;
  };
```

This avoids inventing a separate AST id system — we hold AST nodes by reference.

- [ ] **Step 2: Write failing tests**

Create `packages/engine/tests/evaluator/functions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — functions', () => {
  it('declares and calls a function', () => {
    const { finalValue } = runCode(`
      function add(a, b) { return a + b; }
      add(2, 3);
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 5 });
  });

  it('returns undefined when no return statement is reached', () => {
    const { finalValue } = runCode('function f() {} f();');
    expect(finalValue).toEqual({ kind: 'undefined' });
  });

  it('supports function expressions assigned to variables', () => {
    const { finalValue } = runCode('const f = function (n) { return n * 2; }; f(7);');
    expect(finalValue).toEqual({ kind: 'number', value: 14 });
  });

  it('supports arrow functions with concise body', () => {
    const { finalValue } = runCode('const sq = (n) => n * n; sq(4);');
    expect(finalValue).toEqual({ kind: 'number', value: 16 });
  });

  it('emits enter-frame and leave-frame events on call', () => {
    const { snapshots } = runCode('function f() { return 1; } f();');
    const kinds = snapshots.map((s) => s.eventKind);
    expect(kinds.filter((k) => k === 'enter-frame')).toHaveLength(2); // global + f
    expect(kinds.filter((k) => k === 'leave-frame')).toHaveLength(1);
  });
});
```

Create `packages/engine/tests/evaluator/closures.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — closures', () => {
  it('closes over an outer variable across calls', () => {
    const { finalValue } = runCode(`
      function makeCounter() {
        let n = 0;
        return function () { n = n + 1; return n; };
      }
      const inc = makeCounter();
      inc();
      inc();
      inc();
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 3 });
  });

  it('keeps independent state per closure', () => {
    const { finalValue } = runCode(`
      function makeCounter() { let n = 0; return () => ++n; }
      const a = makeCounter();
      const b = makeCounter();
      a(); a();
      b();
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });
});
```

(`++n` is a prefix update expression; we'll need to support it.)

- [ ] **Step 3: Implement function declaration, expression, arrow, call, return, update**

Add cases to `evalNode` switch:

```ts
    case 'FunctionDeclaration':
      return yield* evalFunctionDecl(node as A.FunctionDeclaration, ctx);
    case 'FunctionExpression':
      return makeFunctionRef(node as A.FunctionExpression, ctx, false);
    case 'ArrowFunctionExpression':
      return makeFunctionRef(node as A.ArrowFunctionExpression, ctx, true);
    case 'CallExpression':
      return yield* evalCall(node as A.CallExpression, ctx);
    case 'ReturnStatement':
      return yield* evalReturn(node as A.ReturnStatement, ctx);
    case 'UpdateExpression':
      return yield* evalUpdate(node as A.UpdateExpression, ctx);
```

Add helpers below:

```ts
import type { Reference } from '../runtime/model';

class ReturnSignal {
  constructor(public value: JSValue) {}
}

function makeFunctionRef(
  node: A.FunctionExpression | A.ArrowFunctionExpression | A.FunctionDeclaration,
  ctx: Context,
  isArrow: boolean,
): Reference {
  const env = ctx.stack.top()!.env;
  const params = (node.params as A.Identifier[]).map((p) => p.name);
  const ref = ctx.heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: null,
    closure: env,
    source: {
      name: 'id' in node && node.id ? node.id.name : undefined,
      params,
      body: node.body as A.Node,
      isArrow,
    },
  });
  return ref;
}

function* evalFunctionDecl(node: A.FunctionDeclaration, ctx: Context): Generator<StepEvent, JSValue> {
  const ref = makeFunctionRef(node, ctx, false);
  ctx.stack.top()!.env.define(node.id!.name, ref, 'var');
  yield { kind: 'allocate', loc: locOf(node), payload: { kind: 'function', name: node.id!.name } };
  return { kind: 'undefined' };
}

function* evalCall(node: A.CallExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const callee = yield* evalNode(node.callee, ctx);
  if (callee.kind !== 'ref') {
    throw new Error('TypeError: call target is not a function');
  }
  const fnObj = ctx.heap.get(callee.id);
  if (!fnObj || fnObj.kind !== 'function' || !fnObj.source || !fnObj.closure) {
    throw new Error('TypeError: callee is not a callable function');
  }
  const args: JSValue[] = [];
  for (const a of node.arguments) args.push(yield* evalNode(a as A.Node, ctx));

  const callEnv = new EnvironmentRecord(fnObj.closure);
  fnObj.source.params.forEach((name, i) =>
    callEnv.define(name, args[i] ?? { kind: 'undefined' }, 'let'),
  );

  ctx.stack.push({
    fn: callee,
    fnName: fnObj.source.name ?? '<anonymous>',
    env: callEnv,
    callSite: locOf(node),
  });
  yield { kind: 'enter-frame', loc: locOf(node), payload: { fnName: fnObj.source.name } };

  let returnValue: JSValue = { kind: 'undefined' };
  try {
    const body = fnObj.source.body;
    if (fnObj.source.isArrow && body.type !== 'BlockStatement') {
      // concise-body arrow: body is the expression itself
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
  yield { kind: 'leave-frame', loc: locOf(node), payload: { returnValue } };
  return returnValue;
}

function* evalReturn(node: A.ReturnStatement, ctx: Context): Generator<StepEvent, JSValue> {
  const v: JSValue = node.argument
    ? yield* evalNode(node.argument, ctx)
    : { kind: 'undefined' };
  throw new ReturnSignal(v);
}

function* evalUpdate(node: A.UpdateExpression, ctx: Context): Generator<StepEvent, JSValue> {
  if (node.argument.type !== 'Identifier') {
    throw new Error('UpdateExpression: only Identifier targets supported in plan 1');
  }
  const env = ctx.stack.top()!.env;
  const before = env.lookup(node.argument.name);
  const beforeNum = toNumber(before);
  const afterNum = node.operator === '++' ? beforeNum + 1 : beforeNum - 1;
  const after: JSValue = { kind: 'number', value: afterNum };
  env.assign(node.argument.name, after);
  yield { kind: 'assign', loc: locOf(node), payload: { name: node.argument.name } };
  return node.prefix ? after : { kind: 'number', value: beforeNum };
}
```

(Note: Function declarations in real JS are hoisted to the top of the scope. For plan 1 we evaluate them in source order; this is a known divergence noted in the spec under §2 unsupported edge cases. Tests must respect order — they do.)

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/functions.test.ts packages/engine/tests/evaluator/closures.test.ts
```

Expected: 5 + 2 = 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/runtime/model.ts packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/functions.test.ts packages/engine/tests/evaluator/closures.test.ts
git commit -m "feat(engine): functions, closures, return, prefix/postfix update"
```

---

## Task 10: Object and array literals + member access

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/objects.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/evaluator/objects.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — objects and arrays', () => {
  it('creates an object literal and reads a property', () => {
    const { finalValue } = runCode('const o = { x: 1, y: 2 }; o.x;');
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });

  it('reads property via computed access', () => {
    const { finalValue } = runCode('const o = { a: 10 }; o["a"];');
    expect(finalValue).toEqual({ kind: 'number', value: 10 });
  });

  it('mutates an own property', () => {
    const { finalValue } = runCode('const o = { x: 1 }; o.x = 5; o.x;');
    expect(finalValue).toEqual({ kind: 'number', value: 5 });
  });

  it('creates and reads from arrays', () => {
    const { finalValue } = runCode('const a = [10, 20, 30]; a[1];');
    expect(finalValue).toEqual({ kind: 'number', value: 20 });
  });

  it('returns undefined for missing property (own only — no prototype walk in plan 1)', () => {
    const { finalValue } = runCode('const o = {}; o.missing;');
    expect(finalValue).toEqual({ kind: 'undefined' });
  });
});
```

- [ ] **Step 2: Implement**

Add to `evalNode` switch:

```ts
    case 'ObjectExpression':
      return yield* evalObjectLiteral(node as A.ObjectExpression, ctx);
    case 'ArrayExpression':
      return yield* evalArrayLiteral(node as A.ArrayExpression, ctx);
    case 'MemberExpression':
      return yield* evalMember(node as A.MemberExpression, ctx);
```

Extend `evalAssign` to support member assignments:

```ts
function* evalAssign(node: A.AssignmentExpression, ctx: Context): Generator<StepEvent, JSValue> {
  if (node.operator !== '=') {
    throw new Error(`Compound assignment ${node.operator} not yet supported`);
  }
  const value = yield* evalNode(node.right, ctx);
  if (node.left.type === 'Identifier') {
    ctx.stack.top()!.env.assign(node.left.name, value);
    yield { kind: 'assign', loc: locOf(node), payload: { name: node.left.name } };
    return value;
  }
  if (node.left.type === 'MemberExpression') {
    const objVal = yield* evalNode(node.left.object, ctx);
    if (objVal.kind !== 'ref') throw new Error('TypeError: assignment target is primitive');
    const key = yield* memberKey(node.left, ctx);
    ctx.heap.setProp(objVal.id, key, value);
    yield { kind: 'mutate', loc: locOf(node), payload: { id: objVal.id, key } };
    return value;
  }
  throw new Error(`AssignmentExpression: unsupported target ${node.left.type}`);
}
```

Add the new helpers at the bottom:

```ts
function* evalObjectLiteral(node: A.ObjectExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const ref = ctx.heap.allocate({
    kind: 'object',
    ownProps: new Map(),
    prototype: null,
  });
  yield { kind: 'allocate', loc: locOf(node), payload: { id: ref.id, kind: 'object' } };
  for (const propNode of node.properties) {
    if (propNode.type !== 'Property') {
      throw new Error('UnsupportedError: spread in object literals (plan 4)');
    }
    const p = propNode as A.Property;
    let key: string;
    if (!p.computed && p.key.type === 'Identifier') {
      key = p.key.name;
    } else {
      const k = yield* evalNode(p.key, ctx);
      key = stringifyKey(k);
    }
    const value = yield* evalNode(p.value, ctx);
    ctx.heap.setProp(ref.id, key, value);
    yield { kind: 'mutate', loc: locOf(p), payload: { id: ref.id, key } };
  }
  return ref;
}

function* evalArrayLiteral(node: A.ArrayExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const ref = ctx.heap.allocate({
    kind: 'array',
    ownProps: new Map(),
    prototype: null,
  });
  yield { kind: 'allocate', loc: locOf(node), payload: { id: ref.id, kind: 'array' } };
  for (let i = 0; i < node.elements.length; i++) {
    const elem = node.elements[i];
    if (elem === null) continue;
    const v = yield* evalNode(elem as A.Node, ctx);
    ctx.heap.setProp(ref.id, String(i), v);
  }
  ctx.heap.setProp(ref.id, 'length', { kind: 'number', value: node.elements.length });
  return ref;
}

function* evalMember(node: A.MemberExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const obj = yield* evalNode(node.object, ctx);
  if (obj.kind !== 'ref') {
    throw new Error('TypeError: property access on primitive (plan 4 will lift via prototypes)');
  }
  const key = yield* memberKey(node, ctx);
  const heapObj = ctx.heap.get(obj.id);
  if (!heapObj) throw new Error('Internal: ref points to no heap object');
  const v = heapObj.ownProps.get(key);
  yield { kind: 'lookup', loc: locOf(node), payload: { id: obj.id, key } };
  return v ?? { kind: 'undefined' };
}

function* memberKey(node: A.MemberExpression, ctx: Context): Generator<StepEvent, string> {
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  const k = yield* evalNode(node.property as A.Node, ctx);
  return stringifyKey(k);
}

function stringifyKey(v: JSValue): string {
  switch (v.kind) {
    case 'string':
      return v.value;
    case 'number':
      return String(v.value);
    default:
      return stringify(v);
  }
}
```

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/objects.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/objects.test.ts
git commit -m "feat(engine): object and array literals, member access, member assignment"
```

---

## Task 11: console.log builtin

**Files:**
- Create: `packages/engine/src/runtime/builtins.ts`
- Modify: `packages/engine/src/evaluator/index.ts` (seed builtins into globalEnv)
- Modify: `packages/engine/src/evaluator/nodes.ts` (CallExpression dispatches to native builtins)
- Modify: `packages/engine/src/runtime/model.ts` (HeapObject can mark itself as native)
- Create: `packages/engine/tests/evaluator/console.test.ts`

- [ ] **Step 1: Mark native functions in HeapObject**

In `packages/engine/src/runtime/model.ts`, extend `HeapObject`:

```ts
export type HeapObject = {
  kind: 'object' | 'array' | 'function';
  ownProps: Map<string, JSValue>;
  prototype: Reference | null;
  closure?: import('./env').EnvironmentRecord;
  source?: { name?: string; params: string[]; body: import('acorn').Node; isArrow: boolean };
  native?: (args: JSValue[], ctx: NativeCtx) => JSValue;
};

export type NativeCtx = {
  consoleOut: string[];
};
```

- [ ] **Step 2: Implement builtins**

Create `packages/engine/src/runtime/builtins.ts`:

```ts
import type { JSValue } from './model';
import type { NativeCtx } from './model';
import type { Heap } from './heap';
import type { EnvironmentRecord } from './env';

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

export function seedBuiltins(heap: Heap, globalEnv: EnvironmentRecord): void {
  const log = heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: null,
    native: (args, ctx) => {
      ctx.consoleOut.push(args.map(stringifyForConsole).join(' '));
      return { kind: 'undefined' };
    },
  });

  const consoleObj = heap.allocate({
    kind: 'object',
    ownProps: new Map([['log', log]]),
    prototype: null,
  });

  globalEnv.define('console', consoleObj, 'const');
}
```

- [ ] **Step 3: Wire seeding in runner**

In `packages/engine/src/evaluator/index.ts`, after `globalEnv` is constructed, call `seedBuiltins(heap, globalEnv)`. Also pass `consoleOut` reference to native invocations via the heap object's `native` callback. Since `evalCall` constructs a `NativeCtx` from `ctx.consoleOut`, no signature change to `runCode` needed.

```ts
import { seedBuiltins } from '../runtime/builtins';
// ...
seedBuiltins(heap, globalEnv);
```

- [ ] **Step 4: Adapt evalCall to dispatch native**

In `packages/engine/src/evaluator/nodes.ts`, inside `evalCall`, before constructing the call frame:

```ts
  if (fnObj.native) {
    const result = fnObj.native(args, { consoleOut: ctx.consoleOut });
    yield { kind: 'console', loc: locOf(node), payload: { line: ctx.consoleOut[ctx.consoleOut.length - 1] } };
    return result;
  }
  if (!fnObj.source || !fnObj.closure) {
    throw new Error('TypeError: callee is not a callable function');
  }
```

(Move the existing `!fnObj.source || !fnObj.closure` check to AFTER the native branch so native funcs without source pass.)

- [ ] **Step 5: Write failing tests**

Create `packages/engine/tests/evaluator/console.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — console.log', () => {
  it('writes plain values to console output', () => {
    const { snapshots } = runCode('console.log("hello", 42);');
    const last = snapshots[snapshots.length - 1];
    expect(last.consoleOut).toEqual(['hello 42']);
  });

  it('writes object as ref id placeholder', () => {
    const { snapshots } = runCode('console.log({ a: 1 });');
    const out = snapshots[snapshots.length - 1].consoleOut[0];
    expect(out).toMatch(/^\[obj\d+\]$/);
  });

  it('emits a console step event', () => {
    const { snapshots } = runCode('console.log("x");');
    const kinds = snapshots.map((s) => s.eventKind);
    expect(kinds).toContain('console');
  });
});
```

- [ ] **Step 6: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/console.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/runtime/builtins.ts packages/engine/src/runtime/model.ts packages/engine/src/evaluator packages/engine/tests/evaluator/console.test.ts
git commit -m "feat(engine): console.log builtin with native dispatch"
```

---

## Task 12: Public API entry point

**Files:**
- Create: `packages/engine/src/index.ts`
- Create: `packages/engine/tests/integration.test.ts`

- [ ] **Step 1: Define public API**

Create `packages/engine/src/index.ts`:

```ts
export { runCode } from './evaluator';
export type { RunResult, RunOptions } from './evaluator';
export type { Snapshot, FrameSnapshot } from './snapshot';
export type { StepEvent, EventKind } from './events';
export type { JSValue, Primitive, Reference, HeapObject, SourceLoc } from './runtime/model';
```

- [ ] **Step 2: Write integration tests**

Create `packages/engine/tests/integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../src/index';

describe('engine integration — closure example from spec', () => {
  const code = `
    function makeCounter() {
      let count = 0;
      const items = [];
      return function counter() {
        count = count + 1;
        items[count - 1] = count;
        return count;
      };
    }
    const inc = makeCounter();
    inc();
    inc();
  `;

  it('returns 2 from the second call', () => {
    const { finalValue } = runCode(code);
    expect(finalValue).toEqual({ kind: 'number', value: 2 });
  });

  it('keeps closure scope alive across calls', () => {
    const { snapshots } = runCode(code);
    const last = snapshots[snapshots.length - 1];
    // The global frame should hold inc → ref to function whose closure refers to a still-existing scope
    const globalFrame = last.callStack[0];
    const incBinding = globalFrame.bindings.get('inc');
    expect(incBinding?.kind).toBe('ref');
  });

  it('produces a non-empty snapshot stream of varied event kinds', () => {
    const { snapshots } = runCode(code);
    const kinds = new Set(snapshots.map((s) => s.eventKind));
    for (const k of ['enter-frame', 'leave-frame', 'allocate', 'assign', 'lookup']) {
      expect(kinds.has(k as never)).toBe(true);
    }
  });
});

describe('engine integration — runs the full sync subset without crash', () => {
  it('handles a mixed-feature program', () => {
    const code = `
      const items = [1, 2, 3, 4];
      let sum = 0;
      for (let i = 0; i < items.length; i = i + 1) {
        sum = sum + items[i];
      }
      const obj = { sum };
      console.log(obj.sum);
      sum;
    `;
    const { finalValue, snapshots } = runCode(code);
    expect(finalValue).toEqual({ kind: 'number', value: 10 });
    expect(snapshots[snapshots.length - 1].consoleOut).toEqual(['10']);
  });
});
```

(Note the test uses `obj = { sum }` — shorthand property. We didn't explicitly add support, but Acorn parses `{ sum }` as `{ sum: sum }` with `shorthand: true`. The current `evalObjectLiteral` reads `p.value` which Acorn fills with the same `Identifier` node — so it works. The integration test asserts this behavior.)

- [ ] **Step 3: Run all tests**

```bash
npx vitest --run
```

Expected: all suites pass — bootstrap, parser, heap, env, snapshot, literals, variables, control-flow, functions, closures, objects, console, integration.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/index.ts packages/engine/tests/integration.test.ts
git commit -m "feat(engine): public API + integration tests for closure example"
```

---

## Task 13: Drill-in stepping flag

**Files:**
- Modify: `packages/engine/src/evaluator/nodes.ts`
- Create: `packages/engine/tests/evaluator/drill-in.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/evaluator/drill-in.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — drill-in stepping', () => {
  it('produces more snapshots with drillIn=true for arithmetic expressions', () => {
    const code = 'let x = 1 + 2 * 3;';
    const off = runCode(code, { drillIn: false }).snapshots.length;
    const on = runCode(code, { drillIn: true }).snapshots.length;
    expect(on).toBeGreaterThan(off);
  });

  it('still computes the same final value with drillIn enabled', () => {
    expect(runCode('1 + 2 * 3;', { drillIn: true }).finalValue).toEqual({
      kind: 'number',
      value: 7,
    });
  });
});
```

- [ ] **Step 2: Add drill-in yields inside evalBinary**

In `packages/engine/src/evaluator/nodes.ts`, inside `evalBinary`, after computing `left` and before computing `right`, and after producing the result, yield additional `lookup` events guarded by `ctx.drillIn`:

```ts
function* evalBinary(node: A.BinaryExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const left = yield* evalNode(node.left, ctx);
  if (ctx.drillIn) yield { kind: 'lookup', loc: locOf(node), payload: { phase: 'left-evaluated' } };
  const right = yield* evalNode(node.right, ctx);
  if (ctx.drillIn) yield { kind: 'lookup', loc: locOf(node), payload: { phase: 'right-evaluated' } };
  const result = computeBinary(node.operator, left, right);
  if (ctx.drillIn) yield { kind: 'lookup', loc: locOf(node), payload: { phase: 'binary-result' } };
  return result;
}

function computeBinary(op: string, left: JSValue, right: JSValue): JSValue {
  switch (op) {
    case '+':
      if (left.kind === 'string' || right.kind === 'string') {
        return { kind: 'string', value: stringify(left) + stringify(right) };
      }
      return { kind: 'number', value: toNumber(left) + toNumber(right) };
    case '-':
      return { kind: 'number', value: toNumber(left) - toNumber(right) };
    case '*':
      return { kind: 'number', value: toNumber(left) * toNumber(right) };
    case '/':
      return { kind: 'number', value: toNumber(left) / toNumber(right) };
    case '%':
      return { kind: 'number', value: toNumber(left) % toNumber(right) };
    case '===':
      return { kind: 'boolean', value: strictEqual(left, right) };
    case '!==':
      return { kind: 'boolean', value: !strictEqual(left, right) };
    case '<':
      return { kind: 'boolean', value: toNumber(left) < toNumber(right) };
    case '>':
      return { kind: 'boolean', value: toNumber(left) > toNumber(right) };
    case '<=':
      return { kind: 'boolean', value: toNumber(left) <= toNumber(right) };
    case '>=':
      return { kind: 'boolean', value: toNumber(left) >= toNumber(right) };
    default:
      throw new Error(`Operator ${op} not supported in plan 1`);
  }
}
```

(Refactor extracts the binary logic out of the generator so the function is shorter and the drill-in yields are explicit.)

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/evaluator/drill-in.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 4: Run the full suite to verify no regressions**

```bash
npx vitest --run
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/evaluator/nodes.ts packages/engine/tests/evaluator/drill-in.test.ts
git commit -m "feat(engine): drill-in flag for sub-expression stepping"
```

---

## Task 14: Cross-check against real V8 for a small set

**Files:**
- Create: `packages/engine/tests/cross-check.test.ts`

- [ ] **Step 1: Write the cross-check harness and tests**

Create `packages/engine/tests/cross-check.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCode } from '../src/index';
import type { JSValue } from '../src/index';

function toJsValue(v: unknown): JSValue {
  if (v === null) return { kind: 'null' };
  if (typeof v === 'undefined') return { kind: 'undefined' };
  if (typeof v === 'number') return { kind: 'number', value: v };
  if (typeof v === 'string') return { kind: 'string', value: v };
  if (typeof v === 'boolean') return { kind: 'boolean', value: v };
  return { kind: 'ref', id: 'real-object' };
}

function realEval(code: string): JSValue {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(`"use strict"; ${code}`);
  return toJsValue(fn());
}

const cases: { name: string; code: string }[] = [
  { name: 'arithmetic precedence', code: 'return 1 + 2 * 3 - 4 / 2;' },
  { name: 'string concat with number', code: 'return "x = " + 1 + 2;' },
  { name: 'nested if', code: 'let x = 5; if (x > 3) { if (x > 4) return "big"; } return "small";' },
  { name: 'loop sum', code: 'let s = 0; for (let i = 1; i <= 5; i = i + 1) s = s + i; return s;' },
  { name: 'closure counter', code: `
      function mk() { let n = 0; return () => ++n; }
      const c = mk();
      c(); c(); c();
      return c();
  ` },
];

describe('cross-check engine vs real V8', () => {
  for (const c of cases) {
    it(c.name, () => {
      const expected = realEval(c.code);
      const ours = runCode(c.code).finalValue;
      // The engine evaluates a Program; `return` is illegal at top level. Wrap to match.
      // For the cross check we wrap our code in a function call too.
      const wrapped = `(function(){ ${c.code} })();`;
      const wrappedOurs = runCode(wrapped).finalValue;
      expect(wrappedOurs).toEqual(expected);
      // Sanity that the unwrapped run produces a value (may be different last-expr semantics).
      expect(ours).toBeDefined();
    });
  }
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest --run packages/engine/tests/cross-check.test.ts
```

Expected: all 5 cases pass. If any fail, the failure points to a divergence; fix in `nodes.ts` rather than relaxing the test.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/cross-check.test.ts
git commit -m "test(engine): cross-check against real V8 for canonical sync cases"
```

---

## Task 15: Lint pass + plan-1 README

**Files:**
- Create: `packages/engine/README.md`

- [ ] **Step 1: Run linter**

```bash
npx eslint packages --ext .ts
```

Expected: zero errors. If any, fix inline before continuing.

- [ ] **Step 2: Format**

```bash
npx prettier --write "packages/**/*.ts"
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest --run
```

Expected: all green.

- [ ] **Step 4: Write engine README**

Create `packages/engine/README.md`:

```markdown
# @js-runtime-visualizer/engine

Headless JavaScript interpreter that produces a stream of immutable
`Snapshot` objects suitable for time-travel UI rendering.

## Plan 1 scope

- Parser wrapper around Acorn.
- Synchronous evaluator covering: literals, arithmetic, variables
  (let/const/var), if/while/for, blocks with lexical scope, function
  declarations and expressions, arrow functions, closures, objects,
  arrays, member access, member assignment, console.log.
- SnapshotStore with Immer-frozen snapshots.
- Drill-in flag for sub-expression stepping.

## Not yet (planned)

- Prototypes, `class`/`extends`, `new`, `Object.create`, `__proto__` — plan 4.
- `throw`/`try`/`catch` and traceback events — plan 5.
- Promises, microtasks, `setTimeout`, `async`/`await` — plan v2.
- Generators, `Symbol`, `Map`/`Set`, `Proxy` — plan v3.

## Usage

\`\`\`ts
import { runCode } from '@js-runtime-visualizer/engine';

const { snapshots, finalValue } = runCode('let x = 1 + 2;');
console.log(finalValue); // { kind: 'number', value: 3 }
console.log(snapshots.length);
\`\`\`

## Tests

\`\`\`bash
npm test
\`\`\`
```

- [ ] **Step 5: Commit**

```bash
git add packages/engine/README.md
git commit -m "docs(engine): plan-1 README with scope and usage"
```

---

## Done — what to expect

After completing all 15 tasks the repository contains:

- A workspace `packages/engine` with a public `runCode(code)` API.
- ~80–100 unit tests across parser, heap, env, snapshot, evaluator suites, plus integration and cross-check.
- An immutable `Snapshot[]` produced per Run, ready to be consumed by the UI in plan 2.

Roll into **plan 2 — UI shell + textual view** next.

---

## Self-review notes

- **Spec coverage.** Plan 1 covers spec §3 architecture (engine layer), §4.1–§4.4 modules (parser, model, heap, env/frames, evaluator skeleton), §4.5 builtins (partial — only `console.log`; rest in plan 4), §5 snapshots, §8.1 testing discipline (parser sanity, golden tests per feature, cross-check, snapshot store memory check). Spec §6 UI, §7 errors, §4.5 prototype-related builtins, §11 traceback are intentionally deferred to later plans.
- **No placeholders.** Every step lists exact file, full code, exact command, expected outcome, commit message.
- **Type consistency.** `JSValue`, `HeapObject`, `EnvironmentRecord`, `Frame`, `Snapshot`, `StepEvent` are introduced in tasks 3–5 and consumed identically through tasks 6–14. `runCode` signature defined in task 6 stays stable.
- **Known divergence from real JS** — function declaration hoisting is not modelled (we evaluate in source order). Tests respect order. Document in plan 4 README when ES5 inheritance lands; revisit before v1 ships if it surfaces in real interview snippets.
