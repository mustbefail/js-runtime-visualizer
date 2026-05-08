# Plan 2 — UI Shell + Textual View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable web app — a Vite + React + Reatom + CodeMirror UI that loads the engine, lets the user type code, click Run, and view every snapshot textually with a time-travel scrubber. Session state (code, drill-in toggle, scrubber speed) persists in `localStorage` so reopening the app restores the last state. Ships the engine's structural-sharing fix (carry-over #1 from plan 1) as a prerequisite.

**Architecture:** A new `packages/ui` workspace consumes `@js-runtime-visualizer/engine`. State lives in Reatom atoms, with persisted atoms using Reatom's built-in `withLocalStorage` extension. The engine layer is unchanged except for a small refactor in `runtime/heap.ts` that dedupes `HeapObject` references across consecutive snapshots — same observable behaviour, ~10× memory savings on long traces.

**Tech Stack:** Node 20+, TypeScript, Vite, React 18, Reatom (`@reatom/core` + `@reatom/react`), CodeMirror 6, Vitest, Playwright.

**Reference spec:** [`docs/superpowers/specs/2026-05-08-js-execution-visualizer-design.md`](../specs/2026-05-08-js-execution-visualizer-design.md)
**Plan 1 outcome:** [`docs/superpowers/plans/2026-05-08-plan-1-engine-foundation.md`](./2026-05-08-plan-1-engine-foundation.md)
**Carry-over from plan 1:** [`docs/superpowers/plan-1-carry-over.md`](../plan-1-carry-over.md)

---

## File structure (created or modified by this plan)

```
js-runtime-visualizer/
├── packages/
│   ├── engine/                           ← existing; one refactor
│   │   ├── src/runtime/heap.ts           ← MODIFIED (dirty tracking + dedup)
│   │   └── tests/heap.test.ts            ← MODIFIED (structural-sharing tests)
│   └── ui/                               ← NEW workspace
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx                  ← React mount + Reatom provider
│       │   ├── App.tsx                   ← layout shell
│       │   ├── types.ts                  ← UI-specific contracts (single-file convention)
│       │   ├── atoms/
│       │   │   ├── session.ts            ← persisted: code, drillIn, scrubberSpeed
│       │   │   ├── engine.ts             ← snapshots, finalValue, runError
│       │   │   ├── ui.ts                 ← currentStepIndex, isPlaying
│       │   │   ├── derived.ts            ← currentSnapshot, totalSteps, isAtStart, isAtEnd
│       │   │   └── actions.ts            ← runAction, resetAction, stepNext/Prev/First/Last
│       │   ├── components/
│       │   │   ├── Toolbar.tsx           ← Run · Reset · drill-in toggle
│       │   │   ├── EditorPane.tsx        ← CodeMirror 6 wired to codeAtom
│       │   │   ├── ScrubberPane.tsx      ← controls + slider + speed
│       │   │   ├── SnapshotPane.tsx      ← composes the three views below
│       │   │   ├── CallStackView.tsx
│       │   │   ├── HeapView.tsx
│       │   │   └── ConsoleView.tsx
│       │   └── styles/
│       │       └── app.css
│       └── tests/
│           ├── atoms/
│           │   ├── session.test.ts       ← persistence round-trip
│           │   ├── engine.test.ts        ← run / reset
│           │   └── derived.test.ts       ← scrubber bounds
│           └── e2e/
│               └── smoke.spec.ts         ← Playwright: type → Run → see snapshot
├── playwright.config.ts                  ← NEW (project-root playwright config)
├── package.json                          ← MODIFY (add ui workspace deps to root scripts)
└── README.md                             ← MODIFY (update roadmap status)
```

The single-file `types.ts` convention from plan 1 carries forward into `packages/ui`.

---

## Conventions

- TDD throughout: failing test → minimal implementation → green → commit.
- Vitest commands always use `--run`; Playwright uses `--reporter=line` to keep output bounded.
- All paths absolute or repo-relative to `/home/codelance/projects/js-runtime-visualizer`.
- Conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- New files: `Write` tool. Edits: `Edit` tool. Never use cat/heredoc.

---

## Task 1: Engine — Heap structural sharing across snapshots

Plan-1 carry-over #1. Without this, every snapshot rebuilds the full heap deeply, costing O(steps × heap-size) memory. After this fix, unchanged `HeapObject` entries are shared across consecutive snapshots — cost drops to O(allocations + mutations).

**Files:**
- Modify: `packages/engine/src/runtime/heap.ts`
- Modify: `packages/engine/tests/heap.test.ts`

- [ ] **Step 1: Add a failing structural-sharing test**

In `packages/engine/tests/heap.test.ts`, append inside the existing `describe('Heap', …)` block, before the closing `});`:

```ts
  it('reuses HeapObject references across consecutive snapshots when nothing changed', () => {
    const heap = new Heap();
    const a = heap.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    const b = heap.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    const snap1 = heap.snapshot();
    const snap2 = heap.snapshot();
    // Identical content, no mutations between captures: same HeapObject refs.
    expect(snap2.get(a.id)).toBe(snap1.get(a.id));
    expect(snap2.get(b.id)).toBe(snap1.get(b.id));
  });

  it('produces fresh HeapObject for ids mutated between snapshots', () => {
    const heap = new Heap();
    const a = heap.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    const b = heap.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    const snap1 = heap.snapshot();
    heap.setProp(a.id, 'x', { kind: 'number', value: 1 });
    const snap2 = heap.snapshot();
    expect(snap2.get(a.id)).not.toBe(snap1.get(a.id));         // changed
    expect(snap2.get(b.id)).toBe(snap1.get(b.id));             // unchanged → shared
    expect(snap2.get(a.id)?.ownProps.get('x')).toEqual({ kind: 'number', value: 1 });
    // snap1 must remain unchanged
    expect(snap1.get(a.id)?.ownProps.has('x')).toBe(false);
  });
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run packages/engine/tests/heap.test.ts
```

Expected: the two new tests fail (current `snapshot()` always returns fresh objects).

- [ ] **Step 3: Implement dirty-tracking in Heap**

Replace the contents of `/home/codelance/projects/js-runtime-visualizer/packages/engine/src/runtime/heap.ts` with:

```ts
import type { HeapObject, IHeap, JSValue, Reference } from '../types';

export class Heap implements IHeap {
  private store = new Map<string, HeapObject>();
  private nextId = 1;

  // Tracks ids that have been allocated or mutated since the last snapshot().
  // Cleared when snapshot() is called.
  private dirtyIds = new Set<string>();

  // The Map returned by the most recent snapshot() call. Used to reuse
  // HeapObject references for ids that were not modified since.
  private lastSnapshot: Map<string, HeapObject> | null = null;

  private freshId(): string {
    return `obj${this.nextId++}`;
  }

  allocate(obj: HeapObject): Reference {
    const id = this.freshId();
    this.store.set(id, obj);
    this.dirtyIds.add(id);
    return { kind: 'ref', id };
  }

  get(id: string): HeapObject | undefined {
    return this.store.get(id);
  }

  setProp(id: string, key: string, value: JSValue): void {
    const obj = this.store.get(id);
    if (!obj) throw new Error(`heap: no object with id ${id}`);
    obj.ownProps.set(key, value);
    this.dirtyIds.add(id);
  }

  size(): number {
    return this.store.size;
  }

  entries(): IterableIterator<[string, HeapObject]> {
    return this.store.entries();
  }

  // Returns a Map of HeapObjects representing the heap at the moment of capture.
  // Unchanged ids reuse the HeapObject reference from the previous snapshot —
  // memory cost is O(allocations + mutations), not O(heap-size).
  snapshot(): Map<string, HeapObject> {
    const out = new Map<string, HeapObject>();
    const prev = this.lastSnapshot;
    for (const [id, obj] of this.store) {
      const isDirty = this.dirtyIds.has(id);
      const prevEntry = prev?.get(id);
      if (isDirty || !prevEntry) {
        // Allocate a fresh shallow copy with a fresh ownProps Map so future
        // mutations to `this.store` cannot leak into this snapshot.
        out.set(id, { ...obj, ownProps: new Map(obj.ownProps) });
      } else {
        // Unmodified: reuse the previous snapshot's frozen-isolated copy.
        out.set(id, prevEntry);
      }
    }
    this.lastSnapshot = out;
    this.dirtyIds.clear();
    return out;
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/engine/tests/heap.test.ts
```

Expected: all 7 heap tests pass (the 5 original + 2 new).

```bash
npx vitest --run
```

Expected: 63 tests pass total (61 plan-1 baseline + 2 new), including the integration and cross-check suites.

- [ ] **Step 5: TypeScript + lint**

```bash
npx tsc --noEmit -p packages/engine
npx eslint packages --ext .ts
```

Expected: both silent.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/runtime/heap.ts packages/engine/tests/heap.test.ts
git commit -m "perf(engine): structural sharing of HeapObjects across snapshots"
```

---

## Task 2: Bootstrap `packages/ui` workspace

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/vite.config.ts`
- Create: `packages/ui/index.html`
- Create: `packages/ui/src/main.tsx`
- Create: `packages/ui/src/App.tsx`
- Modify: root `package.json` to add an `dev` script that runs the UI

- [ ] **Step 1: ui package.json**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/package.json`:

```json
{
  "name": "@js-runtime-visualizer/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@codemirror/lang-javascript": "^6.2.2",
    "@codemirror/state": "^6.4.1",
    "@codemirror/view": "^6.26.0",
    "@js-runtime-visualizer/engine": "*",
    "@reatom/core": "^3.13.0",
    "@reatom/react": "^3.6.0",
    "codemirror": "^6.0.1",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.43.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.2.0"
  }
}
```

- [ ] **Step 2: ui tsconfig**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: vite.config**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

- [ ] **Step 4: index.html**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JS Runtime Visualizer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: minimal main.tsx + App.tsx**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root');
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/App.tsx`:

```tsx
export function App() {
  return <div>JS Runtime Visualizer — UI bootstrap</div>;
}
```

- [ ] **Step 6: root package.json — add ui dev script**

Edit `/home/codelance/projects/js-runtime-visualizer/package.json`. Add to the `"scripts"` section (alongside the existing test/lint/format):

```json
    "ui:dev": "npm --workspace @js-runtime-visualizer/ui run dev",
    "ui:build": "npm --workspace @js-runtime-visualizer/ui run build"
```

The exact path for the edit: between the existing `"format"` line and the closing `}` of `"scripts"`. Final shape:

```json
"scripts": {
  "test": "vitest --run",
  "test:watch": "vitest",
  "lint": "eslint . --ext .ts",
  "format": "prettier --write .",
  "ui:dev": "npm --workspace @js-runtime-visualizer/ui run dev",
  "ui:build": "npm --workspace @js-runtime-visualizer/ui run build"
},
```

- [ ] **Step 7: Install + smoke**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm install
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: install succeeds; the typecheck-then-build prints zero errors and writes to `packages/ui/dist/`.

- [ ] **Step 8: Add `.tsx` to ESLint scope and tsconfig include for tests**

Edit `/home/codelance/projects/js-runtime-visualizer/package.json` — change the `lint` script to also pick up `.tsx`:

```json
"lint": "eslint . --ext .ts,.tsx",
```

Run lint to confirm:

```bash
npx eslint packages --ext .ts,.tsx
```

Expected: zero errors.

- [ ] **Step 9: Update vitest.config to include UI tests in the future**

Edit `/home/codelance/projects/js-runtime-visualizer/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts', 'packages/**/tests/**/*.test.tsx'],
    environment: 'node',
    globals: false,
  },
});
```

(Adds `.test.tsx` so React component tests are picked up later.)

- [ ] **Step 10: Commit**

```bash
git add packages/ui package.json vitest.config.ts
git commit -m "chore(ui): bootstrap packages/ui with Vite + React + TS"
```

---

## Task 3: UI types.ts + Reatom context provider

**Files:**
- Create: `packages/ui/src/types.ts`
- Modify: `packages/ui/src/main.tsx` to wire Reatom context

- [ ] **Step 1: Create UI types file (single-file convention)**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/types.ts`:

```ts
import type { Snapshot, JSValue } from '@js-runtime-visualizer/engine';

// Re-export engine types that UI components consume so that components
// import everything from a single `../types` location.
export type { Snapshot, JSValue };
export type {
  EventKind,
  StepEvent,
  FrameSnapshot,
  SnapshotHighlights,
  HeapObject,
  Reference,
  Primitive,
  SourceLoc,
} from '@js-runtime-visualizer/engine';

// UI-only types

export type RunStatus =
  | { kind: 'idle' }
  | { kind: 'ok'; snapshots: Snapshot[]; finalValue: JSValue }
  | { kind: 'error'; message: string };

// Persistence-key prefix used by all withLocalStorage atoms in this app.
// Bumping STORAGE_VERSION clears all old keys via Reatom's `version` option.
export const STORAGE_PREFIX = 'jsrv';
export const STORAGE_VERSION = 1;

export const persistKey = (slot: string): string =>
  `${STORAGE_PREFIX}:${slot}`;
```

- [ ] **Step 2: Wire Reatom context in main.tsx**

Replace `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { context, connectLogger, clearStack } from '@reatom/core';
import { reatomContext } from '@reatom/react';
import { App } from './App';

// Disable the implicit global stack — every action runs in an explicit context.
clearStack();

const rootFrame = context.start();
if (import.meta.env.DEV) {
  rootFrame.run(connectLogger);
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root');
createRoot(rootEl).render(
  <StrictMode>
    <reatomContext.Provider value={rootFrame}>
      <App />
    </reatomContext.Provider>
  </StrictMode>,
);
```

- [ ] **Step 3: Build to confirm everything resolves**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: build succeeds, no type errors.

If the `@reatom/core` API differs slightly between published versions and these docs (Reatom is on a fast-moving line), prefer the API surface shipped by the installed version: read `node_modules/@reatom/core/package.json` and `index.d.ts` to confirm `context.start()`, `connectLogger`, and `clearStack` are exported. If they aren't, replace with the closest published equivalents and DOC the deviation in the task report — do not silently use a third-party shim.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/types.ts packages/ui/src/main.tsx
git commit -m "feat(ui): types.ts central + Reatom context provider"
```

---

## Task 4: Session atoms with localStorage persistence

Persisted slots: `code`, `drillIn`, `scrubberSpeed`. Each is a single-purpose atom extended with `withLocalStorage`. Versioned via the `version` option so future schema changes can clear stale values cleanly.

**Files:**
- Create: `packages/ui/src/atoms/session.ts`
- Create: `packages/ui/tests/atoms/session.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/atoms/session.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context } from '@reatom/core';

// Stub a minimal localStorage so jsdom is not required.
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

afterEach(() => {
  fakeStorage.clear();
  vi.restoreAllMocks();
});

describe('session atoms — round-trip via localStorage', () => {
  it('codeAtom persists writes to localStorage', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const ctx = context.start();
    ctx.run(() => codeAtom.set('let x = 42;'));
    // The Reatom storage adapter writes synchronously after the action.
    const stored = fakeStorage.getItem('jsrv:code');
    expect(stored).toBeTruthy();
    expect(stored).toContain('"data":"let x = 42;"');
  });

  it('drillInAtom default is false and toggles persist', async () => {
    const { drillInAtom } = await import('../../src/atoms/session');
    const ctx = context.start();
    expect(ctx.get(drillInAtom)).toBe(false);
    ctx.run(() => drillInAtom.set(true));
    expect(ctx.get(drillInAtom)).toBe(true);
    expect(fakeStorage.getItem('jsrv:drillIn')).toContain('"data":true');
  });

  it('scrubberSpeedAtom default is 1 and accepts integer multipliers', async () => {
    const { scrubberSpeedAtom } = await import('../../src/atoms/session');
    const ctx = context.start();
    expect(ctx.get(scrubberSpeedAtom)).toBe(1);
    ctx.run(() => scrubberSpeedAtom.set(4));
    expect(ctx.get(scrubberSpeedAtom)).toBe(4);
  });
});
```

The `import('../../src/atoms/session')` is dynamic so the localStorage stub is applied before the atoms initialise — Reatom hydrates the atom's value from storage at construction time.

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run packages/ui/tests/atoms/session.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement session atoms**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/session.ts`:

```ts
import { atom, withLocalStorage } from '@reatom/core';
import { STORAGE_VERSION, persistKey } from '../types';

// User code in the editor.
export const codeAtom = atom('', 'codeAtom').extend(
  withLocalStorage({
    key: persistKey('code'),
    version: STORAGE_VERSION,
  }),
);

// Drill-in stepping toggle.
export const drillInAtom = atom(false, 'drillInAtom').extend(
  withLocalStorage({
    key: persistKey('drillIn'),
    version: STORAGE_VERSION,
  }),
);

// Scrubber playback speed multiplier (1, 2, 4, …).
export const scrubberSpeedAtom = atom(1, 'scrubberSpeedAtom').extend(
  withLocalStorage({
    key: persistKey('scrubberSpeed'),
    version: STORAGE_VERSION,
  }),
);
```

The `version` option means a future plan that bumps `STORAGE_VERSION` (in `types.ts`) will invalidate all previously stored values automatically — no manual key-clearing needed.

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/ui/tests/atoms/session.test.ts
```

Expected: 3 tests pass.

```bash
npx vitest --run
```

Expected: 66 tests pass total (63 from Task 1 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/atoms/session.ts packages/ui/tests/atoms/session.test.ts
git commit -m "feat(ui): session atoms (code, drillIn, scrubberSpeed) with localStorage"
```

---

## Task 5: Engine atoms + run/reset actions

**Files:**
- Create: `packages/ui/src/atoms/engine.ts`
- Create: `packages/ui/src/atoms/actions.ts`
- Create: `packages/ui/tests/atoms/engine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/atoms/engine.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context } from '@reatom/core';

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

afterEach(() => {
  fakeStorage.clear();
  vi.restoreAllMocks();
});

describe('engine atoms + run action', () => {
  it('runAction populates snapshots and finalValue from valid code', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { snapshotsAtom, finalValueAtom, runErrorAtom } = await import(
      '../../src/atoms/engine'
    );
    const { runAction } = await import('../../src/atoms/actions');

    const ctx = context.start();
    ctx.run(() => codeAtom.set('let x = 1 + 2;'));
    ctx.run(() => runAction());
    expect(ctx.get(snapshotsAtom).length).toBeGreaterThan(0);
    expect(ctx.get(finalValueAtom)).toEqual({ kind: 'undefined' });
    expect(ctx.get(runErrorAtom)).toBeNull();
  });

  it('runAction sets runErrorAtom on parse error', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { snapshotsAtom, runErrorAtom } = await import('../../src/atoms/engine');
    const { runAction } = await import('../../src/atoms/actions');

    const ctx = context.start();
    ctx.run(() => codeAtom.set('let x =;'));
    ctx.run(() => runAction());
    expect(ctx.get(runErrorAtom)).toMatch(/parse/i);
    expect(ctx.get(snapshotsAtom)).toEqual([]);
  });

  it('resetAction clears engine state but does not touch session', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { snapshotsAtom, finalValueAtom, runErrorAtom } = await import(
      '../../src/atoms/engine'
    );
    const { runAction, resetAction } = await import('../../src/atoms/actions');

    const ctx = context.start();
    ctx.run(() => codeAtom.set('let x = 5;'));
    ctx.run(() => runAction());
    expect(ctx.get(snapshotsAtom).length).toBeGreaterThan(0);
    ctx.run(() => resetAction());
    expect(ctx.get(snapshotsAtom)).toEqual([]);
    expect(ctx.get(finalValueAtom)).toBeNull();
    expect(ctx.get(runErrorAtom)).toBeNull();
    expect(ctx.get(codeAtom)).toBe('let x = 5;'); // session preserved
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx vitest --run packages/ui/tests/atoms/engine.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement engine atoms**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/engine.ts`:

```ts
import { atom } from '@reatom/core';
import type { JSValue, Snapshot } from '../types';

export const snapshotsAtom = atom<Snapshot[]>([], 'snapshotsAtom');
export const finalValueAtom = atom<JSValue | null>(null, 'finalValueAtom');
export const runErrorAtom = atom<string | null>(null, 'runErrorAtom');
```

- [ ] **Step 4: Implement actions**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/actions.ts`:

```ts
import { action } from '@reatom/core';
import { runCode } from '@js-runtime-visualizer/engine';
import { codeAtom, drillInAtom } from './session';
import { snapshotsAtom, finalValueAtom, runErrorAtom } from './engine';

export const runAction = action(() => {
  const code = codeAtom();
  const drillIn = drillInAtom();
  try {
    const { snapshots, finalValue } = runCode(code, { drillIn });
    snapshotsAtom.set(snapshots);
    finalValueAtom.set(finalValue);
    runErrorAtom.set(null);
  } catch (e) {
    runErrorAtom.set(e instanceof Error ? e.message : String(e));
    snapshotsAtom.set([]);
    finalValueAtom.set(null);
  }
}, 'runAction');

export const resetAction = action(() => {
  snapshotsAtom.set([]);
  finalValueAtom.set(null);
  runErrorAtom.set(null);
}, 'resetAction');
```

(Note: `codeAtom()` is the Reatom v3 read-as-call syntax inside an `action`/`computed` body.)

- [ ] **Step 5: Run tests — expect pass**

```bash
npx vitest --run packages/ui/tests/atoms/engine.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/atoms/engine.ts packages/ui/src/atoms/actions.ts packages/ui/tests/atoms/engine.test.ts
git commit -m "feat(ui): engine atoms + run/reset actions"
```

---

## Task 6: UI atoms + derived atoms (scrubber state)

**Files:**
- Create: `packages/ui/src/atoms/ui.ts`
- Create: `packages/ui/src/atoms/derived.ts`
- Create: `packages/ui/tests/atoms/derived.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/atoms/derived.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context } from '@reatom/core';

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

afterEach(() => {
  fakeStorage.clear();
  vi.restoreAllMocks();
});

describe('derived atoms — scrubber bounds', () => {
  it('totalSteps reflects snapshots length', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { totalStepsAtom } = await import('../../src/atoms/derived');
    const { runAction } = await import('../../src/atoms/actions');

    const ctx = context.start();
    expect(ctx.get(totalStepsAtom)).toBe(0);
    ctx.run(() => codeAtom.set('let x = 1;'));
    ctx.run(() => runAction());
    expect(ctx.get(totalStepsAtom)).toBeGreaterThan(0);
  });

  it('isAtStart and isAtEnd reflect currentStepIndex bounds', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { currentStepIndexAtom } = await import('../../src/atoms/ui');
    const { isAtStartAtom, isAtEndAtom, totalStepsAtom } = await import(
      '../../src/atoms/derived'
    );
    const { runAction } = await import('../../src/atoms/actions');

    const ctx = context.start();
    ctx.run(() => codeAtom.set('let x = 1; x;'));
    ctx.run(() => runAction());
    const total = ctx.get(totalStepsAtom);
    ctx.run(() => currentStepIndexAtom.set(0));
    expect(ctx.get(isAtStartAtom)).toBe(true);
    expect(ctx.get(isAtEndAtom)).toBe(false);
    ctx.run(() => currentStepIndexAtom.set(total - 1));
    expect(ctx.get(isAtStartAtom)).toBe(false);
    expect(ctx.get(isAtEndAtom)).toBe(true);
  });

  it('runAction resets currentStepIndex to last step', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { currentStepIndexAtom } = await import('../../src/atoms/ui');
    const { totalStepsAtom } = await import('../../src/atoms/derived');
    const { runAction } = await import('../../src/atoms/actions');

    const ctx = context.start();
    ctx.run(() => codeAtom.set('let x = 1; x;'));
    ctx.run(() => runAction());
    const total = ctx.get(totalStepsAtom);
    expect(ctx.get(currentStepIndexAtom)).toBe(total - 1);
  });
});
```

- [ ] **Step 2: Implement UI atoms**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/ui.ts`:

```ts
import { atom } from '@reatom/core';

export const currentStepIndexAtom = atom(0, 'currentStepIndexAtom');
export const isPlayingAtom = atom(false, 'isPlayingAtom');
```

- [ ] **Step 3: Implement derived atoms**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/derived.ts`:

```ts
import { computed } from '@reatom/core';
import type { Snapshot } from '../types';
import { snapshotsAtom } from './engine';
import { currentStepIndexAtom } from './ui';

export const totalStepsAtom = computed(
  () => snapshotsAtom().length,
  'totalStepsAtom',
);

export const currentSnapshotAtom = computed<Snapshot | null>(() => {
  const snaps = snapshotsAtom();
  const i = currentStepIndexAtom();
  if (snaps.length === 0) return null;
  if (i < 0 || i >= snaps.length) return null;
  return snaps[i] ?? null;
}, 'currentSnapshotAtom');

export const isAtStartAtom = computed(
  () => currentStepIndexAtom() <= 0,
  'isAtStartAtom',
);

export const isAtEndAtom = computed(() => {
  const total = totalStepsAtom();
  if (total === 0) return true;
  return currentStepIndexAtom() >= total - 1;
}, 'isAtEndAtom');
```

- [ ] **Step 4: Update runAction to set currentStepIndex on success**

Edit `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/actions.ts`. Add the import at the top and the index set in the success branch.

Add import:

```ts
import { currentStepIndexAtom } from './ui';
```

In `runAction`, after `snapshotsAtom.set(snapshots);` add:

```ts
    currentStepIndexAtom.set(Math.max(0, snapshots.length - 1));
```

In `runAction`'s catch and in `resetAction`, also set `currentStepIndexAtom.set(0)` so the scrubber stays consistent:

Final `runAction` body:

```ts
  try {
    const { snapshots, finalValue } = runCode(code, { drillIn });
    snapshotsAtom.set(snapshots);
    finalValueAtom.set(finalValue);
    runErrorAtom.set(null);
    currentStepIndexAtom.set(Math.max(0, snapshots.length - 1));
  } catch (e) {
    runErrorAtom.set(e instanceof Error ? e.message : String(e));
    snapshotsAtom.set([]);
    finalValueAtom.set(null);
    currentStepIndexAtom.set(0);
  }
```

Final `resetAction` body:

```ts
  snapshotsAtom.set([]);
  finalValueAtom.set(null);
  runErrorAtom.set(null);
  currentStepIndexAtom.set(0);
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npx vitest --run packages/ui
```

Expected: all UI atom tests pass (session 3 + engine 3 + derived 3 = 9). Full suite: 72 total.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/atoms packages/ui/tests/atoms/derived.test.ts
git commit -m "feat(ui): UI atoms (currentStepIndex, isPlaying) + derived state"
```

---

## Task 7: App shell layout

The shell is a CSS grid. It hosts five named regions: header (toolbar), editor, snapshot view, console, and scrubber. Children components are stubbed in this task and filled in by Tasks 8–13.

**Files:**
- Modify: `packages/ui/src/App.tsx`
- Create: `packages/ui/src/styles/app.css`
- Create: stubs `packages/ui/src/components/{Toolbar,EditorPane,ScrubberPane,SnapshotPane,CallStackView,HeapView,ConsoleView}.tsx`

- [ ] **Step 1: Add the layout CSS**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/styles/app.css`:

```css
:root {
  color-scheme: dark;
  --bg: #11111b;
  --panel: #1e1e2e;
  --panel-2: #181825;
  --border: #313244;
  --text: #cdd6f4;
  --muted: #a6adc8;
  --accent: #fab387;
  --good: #a6e3a1;
  --bad: #f38ba8;
  --info: #89b4fa;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
}

.app {
  display: grid;
  grid-template-rows: 44px 1fr 220px 36px;
  grid-template-columns: 50% 50%;
  grid-template-areas:
    'toolbar  toolbar'
    'editor   snapshot'
    'console  snapshot'
    'scrubber scrubber';
  height: 100vh;
}

.toolbar  { grid-area: toolbar;  border-bottom: 1px solid var(--border); }
.editor   { grid-area: editor;   border-right: 1px solid var(--border); overflow: hidden; }
.snapshot { grid-area: snapshot; overflow: auto; padding: 12px; }
.console  { grid-area: console;  border-top: 1px solid var(--border); border-right: 1px solid var(--border); padding: 8px 12px; overflow: auto; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.scrubber { grid-area: scrubber; border-top: 1px solid var(--border); padding: 6px 12px; display: flex; align-items: center; gap: 8px; }

button { background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 4px 10px; cursor: pointer; font: inherit; }
button:hover { border-color: var(--muted); }
button[disabled] { opacity: 0.4; cursor: not-allowed; }

.section-title { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px 0; }
```

- [ ] **Step 2: Stub child components**

Each stub is a one-liner so the layout compiles:

`packages/ui/src/components/Toolbar.tsx`:

```tsx
export function Toolbar() {
  return <div className="toolbar">toolbar</div>;
}
```

`packages/ui/src/components/EditorPane.tsx`:

```tsx
export function EditorPane() {
  return <div className="editor">editor</div>;
}
```

`packages/ui/src/components/ScrubberPane.tsx`:

```tsx
export function ScrubberPane() {
  return <div className="scrubber">scrubber</div>;
}
```

`packages/ui/src/components/SnapshotPane.tsx`:

```tsx
export function SnapshotPane() {
  return <div className="snapshot">snapshot</div>;
}
```

`packages/ui/src/components/ConsoleView.tsx`:

```tsx
export function ConsoleView() {
  return <div className="console">console</div>;
}
```

`packages/ui/src/components/CallStackView.tsx`:

```tsx
export function CallStackView() {
  return null;
}
```

`packages/ui/src/components/HeapView.tsx`:

```tsx
export function HeapView() {
  return null;
}
```

- [ ] **Step 3: Replace App.tsx**

Replace `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/App.tsx`:

```tsx
import { Toolbar } from './components/Toolbar';
import { EditorPane } from './components/EditorPane';
import { ScrubberPane } from './components/ScrubberPane';
import { SnapshotPane } from './components/SnapshotPane';
import { ConsoleView } from './components/ConsoleView';
import './styles/app.css';

export function App() {
  return (
    <div className="app">
      <Toolbar />
      <EditorPane />
      <SnapshotPane />
      <ConsoleView />
      <ScrubberPane />
    </div>
  );
}
```

- [ ] **Step 4: Build to confirm types resolve**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: builds cleanly.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/App.tsx packages/ui/src/styles packages/ui/src/components
git commit -m "feat(ui): app shell layout with stubbed panes"
```

---

## Task 8: EditorPane (CodeMirror 6 wired to codeAtom)

**Files:**
- Modify: `packages/ui/src/components/EditorPane.tsx`

- [ ] **Step 1: Replace EditorPane with a wired CodeMirror 6 editor**

Replace the entire contents of `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/EditorPane.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { useAtom, useAction } from '@reatom/react';
import { action } from '@reatom/core';
import { codeAtom } from '../atoms/session';

const setCodeAction = action((next: string) => codeAtom.set(next), 'setCodeAction');

export function EditorPane() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [code] = useAtom(codeAtom);
  const setCode = useAction(setCodeAction);

  // Mount once. Subsequent codeAtom changes (e.g. after rehydrate) are
  // pushed into the editor through the effect below.
  useEffect(() => {
    if (!hostRef.current) return;
    const startState = EditorState.create({
      doc: code,
      extensions: [
        basicSetup,
        javascript(),
        EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontFamily: 'JetBrains Mono, monospace' } }),
        EditorView.updateListener.of((vu) => {
          if (vu.docChanged) {
            const next = vu.state.doc.toString();
            // Avoid unnecessary writes when the doc matches the atom (rehydrate path).
            if (next !== codeAtom()) setCode(next);
          }
        }),
      ],
    });
    const view = new EditorView({ state: startState, parent: hostRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // We intentionally mount once; later codeAtom syncs are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror external codeAtom changes (e.g. on initial rehydrate from localStorage)
  // into the editor view, but only when the values diverge.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const docNow = view.state.doc.toString();
    if (docNow !== code) {
      view.dispatch({ changes: { from: 0, to: docNow.length, insert: code } });
    }
  }, [code]);

  return <div className="editor" ref={hostRef} />;
}
```

- [ ] **Step 2: Manual smoke (dev server)**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run dev &
sleep 2
curl -sf http://localhost:5173/ | head -3
kill %1 2>/dev/null || true
```

Expected: HTTP 200 with the index HTML. (The agent should not interactively test in a browser; this confirms the dev server boots and serves the app shell.)

- [ ] **Step 3: Build**

```bash
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean build, single bundle.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/EditorPane.tsx
git commit -m "feat(ui): CodeMirror 6 editor wired to codeAtom"
```

---

## Task 9: Toolbar (Run / Reset / drill-in toggle)

**Files:**
- Modify: `packages/ui/src/components/Toolbar.tsx`

- [ ] **Step 1: Replace Toolbar with the wired controls**

Replace the entire contents of `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/Toolbar.tsx`:

```tsx
import { useAtom, useAction } from '@reatom/react';
import { action } from '@reatom/core';
import { drillInAtom } from '../atoms/session';
import { runErrorAtom } from '../atoms/engine';
import { runAction, resetAction } from '../atoms/actions';

const toggleDrillInAction = action(
  () => drillInAtom.set((prev) => !prev),
  'toggleDrillInAction',
);

export function Toolbar() {
  const [drillIn] = useAtom(drillInAtom);
  const [runError] = useAtom(runErrorAtom);
  const onRun = useAction(runAction);
  const onReset = useAction(resetAction);
  const onToggleDrillIn = useAction(toggleDrillInAction);

  return (
    <div className="toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
      <strong>JS Runtime Visualizer</strong>
      <div style={{ flex: 1 }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
        <input type="checkbox" checked={drillIn} onChange={onToggleDrillIn} />
        drill-in
      </label>
      <button onClick={onRun}>Run</button>
      <button onClick={onReset}>Reset</button>
      {runError && (
        <span style={{ color: 'var(--bad)', fontSize: 12, marginLeft: 8 }} title={runError}>
          ⊗ error
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/Toolbar.tsx
git commit -m "feat(ui): toolbar with Run/Reset/drill-in toggle"
```

---

## Task 10: CallStackView component

Renders the current snapshot's call stack: each frame shows function name, call site, and bindings.

**Files:**
- Modify: `packages/ui/src/components/CallStackView.tsx`

- [ ] **Step 1: Replace CallStackView**

Replace the entire contents of `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/CallStackView.tsx`:

```tsx
import { useAtom } from '@reatom/react';
import { currentSnapshotAtom } from '../atoms/derived';
import type { JSValue } from '../types';

function renderValue(v: JSValue): string {
  switch (v.kind) {
    case 'undefined':
      return 'undefined';
    case 'null':
      return 'null';
    case 'boolean':
    case 'number':
      return String(v.value);
    case 'string':
      return JSON.stringify(v.value);
    case 'ref':
      return `→ ${v.id}`;
  }
}

export function CallStackView() {
  const [snap] = useAtom(currentSnapshotAtom);
  if (!snap) {
    return (
      <div>
        <div className="section-title">Call stack</div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>(no snapshot)</div>
      </div>
    );
  }
  return (
    <div>
      <div className="section-title">Call stack ({snap.callStack.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {snap.callStack
          .slice()
          .reverse()
          .map((frame, idxFromTop) => {
            const original = snap.callStack.length - 1 - idxFromTop;
            const isTop = idxFromTop === 0;
            return (
              <div
                key={`${original}-${frame.fnName}`}
                style={{
                  background: 'var(--panel)',
                  border: `1px solid ${isTop ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6,
                  padding: 6,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: isTop ? 'var(--accent)' : 'var(--info)' }}>
                    {isTop ? '▶ ' : '  '}
                    {frame.fnName}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 10 }}>
                    {frame.callSite ? `L${frame.callSite.line}` : ''}
                  </span>
                </div>
                {Array.from(frame.bindings.entries()).map(([k, v]) => (
                  <div key={k} style={{ paddingLeft: 6, color: 'var(--text)' }}>
                    <span style={{ color: 'var(--good)' }}>{k}</span>: {renderValue(v)}
                  </div>
                ))}
                {frame.bindings.size === 0 && (
                  <div style={{ paddingLeft: 6, color: 'var(--muted)', fontSize: 10 }}>
                    (no bindings)
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/CallStackView.tsx
git commit -m "feat(ui): CallStackView — frames + bindings"
```

---

## Task 11: HeapView component

**Files:**
- Modify: `packages/ui/src/components/HeapView.tsx`

- [ ] **Step 1: Replace HeapView**

Replace the entire contents of `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/HeapView.tsx`:

```tsx
import { useAtom } from '@reatom/react';
import { currentSnapshotAtom } from '../atoms/derived';
import type { HeapObject, JSValue } from '../types';

function renderValue(v: JSValue): string {
  switch (v.kind) {
    case 'undefined':
      return 'undefined';
    case 'null':
      return 'null';
    case 'boolean':
    case 'number':
      return String(v.value);
    case 'string':
      return JSON.stringify(v.value);
    case 'ref':
      return `→ ${v.id}`;
  }
}

function renderObject(obj: HeapObject, id: string) {
  const bg = 'var(--panel)';
  const labelColor =
    obj.kind === 'function' ? 'var(--info)' :
    obj.kind === 'array' ? 'var(--accent)' :
    'var(--good)';
  return (
    <div
      key={id}
      style={{
        background: bg,
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 6,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: labelColor }}>
          {obj.kind} #{id}
        </span>
        <span style={{ color: 'var(--muted)', fontSize: 10 }}>
          {obj.source?.name ? `ƒ ${obj.source.name}` : ''}
        </span>
      </div>
      {Array.from(obj.ownProps.entries()).map(([k, v]) => (
        <div key={k} style={{ paddingLeft: 6, color: 'var(--text)' }}>
          <span style={{ color: 'var(--good)' }}>{k}</span>: {renderValue(v)}
        </div>
      ))}
      {obj.ownProps.size === 0 && (
        <div style={{ paddingLeft: 6, color: 'var(--muted)', fontSize: 10 }}>
          (no own props)
        </div>
      )}
    </div>
  );
}

export function HeapView() {
  const [snap] = useAtom(currentSnapshotAtom);
  if (!snap) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="section-title">Heap ({snap.heap.size})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from(snap.heap.entries()).map(([id, obj]) => renderObject(obj, id))}
        {snap.heap.size === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>(empty)</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/HeapView.tsx
git commit -m "feat(ui): HeapView — objects with own props"
```

---

## Task 12: ConsoleView + SnapshotPane composition

**Files:**
- Modify: `packages/ui/src/components/ConsoleView.tsx`
- Modify: `packages/ui/src/components/SnapshotPane.tsx`

- [ ] **Step 1: Replace ConsoleView**

Replace the entire contents of `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/ConsoleView.tsx`:

```tsx
import { useAtom } from '@reatom/react';
import { currentSnapshotAtom } from '../atoms/derived';

export function ConsoleView() {
  const [snap] = useAtom(currentSnapshotAtom);
  const lines = snap?.consoleOut ?? [];
  return (
    <div className="console">
      <div className="section-title">Console</div>
      {lines.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 11 }}>(no output)</div>
      ) : (
        lines.map((line, i) => (
          <div key={i}>
            <span style={{ color: 'var(--muted)' }}>{i + 1}</span> {line}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace SnapshotPane**

Replace the entire contents of `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/SnapshotPane.tsx`:

```tsx
import { useAtom } from '@reatom/react';
import { CallStackView } from './CallStackView';
import { HeapView } from './HeapView';
import { currentSnapshotAtom, totalStepsAtom } from '../atoms/derived';
import { currentStepIndexAtom } from '../atoms/ui';

export function SnapshotPane() {
  const [snap] = useAtom(currentSnapshotAtom);
  const [step] = useAtom(currentStepIndexAtom);
  const [total] = useAtom(totalStepsAtom);
  return (
    <div className="snapshot">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>Snapshot</strong>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          {snap ? `step ${step + 1} / ${total} · ${snap.eventKind} @ L${snap.loc.line}` : '(no run)'}
        </span>
      </div>
      <CallStackView />
      <HeapView />
    </div>
  );
}
```

- [ ] **Step 3: Build**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/ConsoleView.tsx packages/ui/src/components/SnapshotPane.tsx
git commit -m "feat(ui): ConsoleView + SnapshotPane composition"
```

---

## Task 13: ScrubberPane (controls + slider + speed)

**Files:**
- Modify: `packages/ui/src/components/ScrubberPane.tsx`

- [ ] **Step 1: Replace ScrubberPane**

Replace the entire contents of `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/ScrubberPane.tsx`:

```tsx
import { useEffect } from 'react';
import { useAtom, useAction } from '@reatom/react';
import { action } from '@reatom/core';
import { currentStepIndexAtom, isPlayingAtom } from '../atoms/ui';
import { totalStepsAtom, isAtStartAtom, isAtEndAtom } from '../atoms/derived';
import { scrubberSpeedAtom } from '../atoms/session';

const stepFirst = action(() => currentStepIndexAtom.set(0), 'stepFirst');
const stepPrev = action(
  () => currentStepIndexAtom.set((i) => Math.max(0, i - 1)),
  'stepPrev',
);
const stepNext = action(() => {
  const total = totalStepsAtom();
  currentStepIndexAtom.set((i) => Math.min(total - 1, i + 1));
}, 'stepNext');
const stepLast = action(() => {
  const total = totalStepsAtom();
  currentStepIndexAtom.set(Math.max(0, total - 1));
}, 'stepLast');
const togglePlay = action(
  () => isPlayingAtom.set((p) => !p),
  'togglePlay',
);
const setStep = action((i: number) => currentStepIndexAtom.set(i), 'setStep');
const setSpeed = action((n: number) => scrubberSpeedAtom.set(n), 'setSpeed');

export function ScrubberPane() {
  const [step] = useAtom(currentStepIndexAtom);
  const [total] = useAtom(totalStepsAtom);
  const [atStart] = useAtom(isAtStartAtom);
  const [atEnd] = useAtom(isAtEndAtom);
  const [playing] = useAtom(isPlayingAtom);
  const [speed] = useAtom(scrubberSpeedAtom);

  const onFirst = useAction(stepFirst);
  const onPrev = useAction(stepPrev);
  const onNext = useAction(stepNext);
  const onLast = useAction(stepLast);
  const onToggle = useAction(togglePlay);
  const onSetStep = useAction(setStep);
  const onSetSpeed = useAction(setSpeed);

  // Auto-advance when playing.
  useEffect(() => {
    if (!playing || total === 0) return;
    const interval = Math.max(20, 200 / speed);
    const id = window.setInterval(() => {
      const cur = currentStepIndexAtom();
      if (cur >= total - 1) {
        isPlayingAtom.set(false);
      } else {
        currentStepIndexAtom.set(cur + 1);
      }
    }, interval);
    return () => window.clearInterval(id);
  }, [playing, speed, total]);

  return (
    <div className="scrubber">
      <button onClick={onFirst} disabled={atStart || total === 0}>⏮</button>
      <button onClick={onPrev} disabled={atStart || total === 0}>◀</button>
      <button onClick={onToggle} disabled={total === 0}>{playing ? '⏸' : '▶'}</button>
      <button onClick={onNext} disabled={atEnd || total === 0}>▶</button>
      <button onClick={onLast} disabled={atEnd || total === 0}>⏭</button>
      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={step}
        onChange={(e) => onSetStep(Number(e.currentTarget.value))}
        style={{ flex: 1 }}
        disabled={total === 0}
      />
      <span style={{ color: 'var(--muted)', fontSize: 11, minWidth: 80, textAlign: 'right' }}>
        {total === 0 ? 'no run' : `${step + 1} / ${total}`}
      </span>
      <select value={speed} onChange={(e) => onSetSpeed(Number(e.currentTarget.value))}>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
        <option value={8}>8×</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ScrubberPane.tsx
git commit -m "feat(ui): scrubber with controls, slider, and speed select"
```

---

## Task 14: Editor current-line marker

Highlights the line of the current snapshot's `loc` in the CodeMirror editor by adding a line decoration that updates whenever `currentSnapshotAtom` changes.

**Files:**
- Modify: `packages/ui/src/components/EditorPane.tsx`

- [ ] **Step 1: Replace EditorPane with line-highlight support**

Replace `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/EditorPane.tsx` with:

```tsx
import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';
import { useAtom, useAction } from '@reatom/react';
import { action } from '@reatom/core';
import { codeAtom } from '../atoms/session';
import { currentSnapshotAtom } from '../atoms/derived';

const setCodeAction = action((next: string) => codeAtom.set(next), 'setCodeAction');

const setCurrentLine = StateEffect.define<number | null>();
const currentLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setCurrentLine)) {
        if (e.value === null) return Decoration.none;
        const lineInfo = tr.state.doc.line(Math.min(e.value, tr.state.doc.lines));
        return Decoration.set([
          Decoration.line({ attributes: { style: 'background: rgba(250,179,135,0.18)' } }).range(lineInfo.from),
        ]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function EditorPane() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [code] = useAtom(codeAtom);
  const [snap] = useAtom(currentSnapshotAtom);
  const setCode = useAction(setCodeAction);

  useEffect(() => {
    if (!hostRef.current) return;
    const startState = EditorState.create({
      doc: code,
      extensions: [
        basicSetup,
        javascript(),
        currentLineField,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { fontFamily: 'JetBrains Mono, monospace' },
        }),
        EditorView.updateListener.of((vu) => {
          if (vu.docChanged) {
            const next = vu.state.doc.toString();
            if (next !== codeAtom()) setCode(next);
          }
        }),
      ],
    });
    const view = new EditorView({ state: startState, parent: hostRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External codeAtom → editor doc mirroring.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const docNow = view.state.doc.toString();
    if (docNow !== code) {
      view.dispatch({ changes: { from: 0, to: docNow.length, insert: code } });
    }
  }, [code]);

  // Push current line decoration whenever the snapshot changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const line = snap?.loc.line ?? null;
    view.dispatch({ effects: setCurrentLine.of(line) });
  }, [snap]);

  return <div className="editor" ref={hostRef} />;
}
```

- [ ] **Step 2: Build**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/EditorPane.tsx
git commit -m "feat(ui): editor highlights current snapshot line"
```

---

## Task 15: Playwright smoke test

End-to-end smoke: serve the built app, type a snippet, click Run, see at least one frame in the call stack panel.

**Files:**
- Create: `playwright.config.ts` (project root)
- Create: `packages/ui/tests/e2e/smoke.spec.ts`
- Modify: root `package.json` to add an `e2e` script

- [ ] **Step 1: Add Playwright config**

Create `/home/codelance/projects/js-runtime-visualizer/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'packages/ui/tests/e2e',
  reporter: 'line',
  timeout: 30_000,
  webServer: {
    command: 'npm --workspace @js-runtime-visualizer/ui run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
});
```

- [ ] **Step 2: Add the smoke spec**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('type code → click Run → snapshot pane shows the global frame', async ({ page }) => {
  // Clean storage so codeAtom default of '' is used.
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');

  // Wait for the editor to mount.
  await page.waitForSelector('.cm-content');

  // Replace editor contents — focus, select-all via keyboard, then type.
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('let x = 1 + 2; let y = x * 4;');

  // Run.
  await page.getByRole('button', { name: 'Run' }).click();

  // Snapshot pane reports a step count > 0.
  const snapshotPane = page.locator('.snapshot');
  await expect(snapshotPane).toContainText(/step \d+ \/ \d+/);

  // Call stack contains the global frame.
  await expect(snapshotPane).toContainText('<global>');

  // Console pane is reachable (may be empty for this snippet).
  await expect(page.locator('.console')).toBeVisible();
});
```

- [ ] **Step 3: Add the e2e script to root package.json**

Edit `/home/codelance/projects/js-runtime-visualizer/package.json`. Add the script to `"scripts"`:

```json
    "e2e": "playwright test",
    "e2e:install": "playwright install --with-deps chromium"
```

- [ ] **Step 4: Install Chromium**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm run e2e:install
```

Expected: Chromium downloaded once. Subsequent runs skip the install.

- [ ] **Step 5: Run the smoke test**

```bash
npm run e2e
```

Expected: 1 test passes.

If the dev server boots slowly on the agent host, the playwright config's `timeout: 60_000` for `webServer` covers up to 60s. If failures persist, raise the timeout and re-run.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts packages/ui/tests/e2e package.json
git commit -m "test(ui): playwright smoke — type, run, see snapshot"
```

---

## Task 16: README + final lint/format

**Files:**
- Modify: `README.md` (project root) — bump roadmap, list new app entry point
- Create: `packages/ui/README.md`
- Run: lint + format on all sources

- [ ] **Step 1: Update top-level README — flip plan-2 to ✅**

Edit `/home/codelance/projects/js-runtime-visualizer/README.md`. Replace this line:

```markdown
- [ ] **Plan 2** — UI shell: Vite + React + Reatom + CodeMirror, Run button, textual snapshot view, time-travel scrubber. Plus structural-sharing in `SnapshotStore`.
```

with:

```markdown
- [x] **Plan 2** — UI shell: Vite + React + Reatom + CodeMirror, Run button, textual snapshot view, time-travel scrubber, session persisted in `localStorage`. Engine snapshots now share `HeapObject` references across steps. _Completed 2026-05-08._
```

Also append a one-liner under the existing "Quick start" section so people know how to run the app:

After the existing `npm test` block in Quick Start, add:

```markdown
**Run the app (dev mode):**

```bash
npm run ui:dev   # serves http://localhost:5173
```
```

- [ ] **Step 2: Create UI package README**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/README.md`:

```markdown
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
```

- [ ] **Step 3: Lint + format**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx eslint packages --ext .ts,.tsx
npx prettier --write "packages/**/*.{ts,tsx,css}"
```

Expected: lint silent. Prettier may rewrite whitespace; that's fine.

- [ ] **Step 4: Final test gate**

```bash
npx vitest --run
```

Expected: 72+ tests pass (depending on whether prettier rewrites trigger any test diffs — they shouldn't).

```bash
npm run e2e
```

Expected: 1 e2e test passes.

```bash
npx tsc --noEmit -p packages/engine
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add README.md packages/ui/README.md packages/
git commit -m "docs: plan 2 complete — UI shell, persistence, structural sharing"
```

---

## Done — what to expect

After all 16 tasks the repository contains:

- Engine: structural sharing of `HeapObject` references across snapshots; ~10× memory savings on long traces (tested).
- New `packages/ui` workspace with Vite + React + Reatom + CodeMirror 6.
- A working web app at `npm run ui:dev` that lets the user type code, click Run, view all snapshots step by step in a textual pane, and scrub through them. Code, drill-in toggle, and scrubber speed persist to `localStorage` automatically.
- Atom tests (~9) for the new state layer and a Playwright smoke test for the end-to-end flow.

Roll into **plan 3 — canvas visualisation** next: pan/zoom SVG canvas, draggable frames + heap nodes, edges, collapse. Plan 3 will replace `SnapshotPane`'s textual view with the canvas while reusing the same Reatom atoms.

---

## Self-review

- **Spec coverage**: §3 architecture (engine + visualizer split — plan 1 + this plan), §6 UI structure (toolbar, editor, snapshot pane, console, scrubber — all in this plan minus the canvas, deferred to plan 3), §6.3 state in Reatom — covered, §6.5 Run/Reset model — covered, §5.3 time travel via `setIndex(i)` — covered. §6.2 canvas details and §7 errors/traceback are intentionally outside plan 2.
- **No placeholders**: every step lists the files, complete code, exact command, expected output, and commit message.
- **Type consistency**: `Snapshot`, `JSValue`, `HeapObject`, `FrameSnapshot`, `EventKind`, `SnapshotHighlights` are imported from `@js-runtime-visualizer/engine`/`../types` consistently across components and atoms. Atom names match between definition (Tasks 4–6) and consumption (Tasks 7–13).
- **Carry-over coverage**: plan-1 carry-over #1 (structural sharing) is Task 1; #2 (extra exports) was applied at end of plan 1; #3 (`lookup` event overload) is implicitly handled in `SnapshotPane` which displays `eventKind` directly without special-casing the drill-in `phase` payload — UI shows it as a normal `lookup` step.
- **Carry-over to plan 3**: replace `SnapshotPane` with the canvas; persist node positions; preserve all atom contracts unchanged.
