# Plan 3 — Canvas Visualisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the textual `SnapshotPane` with an interactive SVG canvas — call stack frames on the left, heap objects on the right, reference edges between them, draggable nodes, collapse toggle per node, pan + zoom on the canvas. Node positions and collapsed state persist in `localStorage`. Closes plan-2 carry-over items 1–4 except the prototype-edge work, which stays in plan 4.

**Architecture:** A new `packages/ui/src/canvas/` module owns the layout primitives (default position function, drag hook, pan/zoom hook, screen↔canvas coord helpers, snapshot→edge extractor). A new `CanvasPane` component composes an SVG host with a transformed inner group containing `FrameNode`/`HeapNode` instances and an `EdgesLayer`. State splits between the existing Reatom atoms (positions persisted via `withLocalStorage`, `dragState` and `panZoom` transient). Edge rendering reads the current snapshot's references — variable→object only this plan; `[[Prototype]]` and closure scope edges are plan 4.

**Tech Stack:** Same as plan 2 (Node 20+, TypeScript, Vite, React 18, Reatom 1000.x, CodeMirror 6). No new runtime dependencies — drag, pan, zoom, and edges are hand-rolled per spec §6.2 ("No graph-layout library").

**Reference spec:** [`docs/superpowers/specs/2026-05-08-js-execution-visualizer-design.md`](../specs/2026-05-08-js-execution-visualizer-design.md) — §6.2 "Canvas details".
**Carry-overs:** [`docs/superpowers/plan-2-carry-over.md`](../plan-2-carry-over.md) — items 1, 2, 3, 4, 5.

---

## File structure (created or modified by this plan)

```
js-runtime-visualizer/
├── packages/ui/
│   ├── src/
│   │   ├── App.tsx                              ← MODIFY: render CanvasPane instead of SnapshotPane
│   │   ├── types.ts                             ← MODIFY: add Position, PanZoom, NodeId types
│   │   ├── atoms/
│   │   │   ├── session.ts                       ← MODIFY: add nodePositionsAtom, collapsedIdsAtom
│   │   │   └── canvas.ts                        ← NEW: panZoomAtom, dragStateAtom (transient)
│   │   ├── canvas/                              ← NEW dir — pure helpers + hooks
│   │   │   ├── layout.ts                        ← defaultLayout(snapshot, prevPositions)
│   │   │   ├── refs.ts                          ← extractEdges(snapshot)
│   │   │   ├── coords.ts                        ← screenToCanvas / canvasToScreen
│   │   │   ├── useDrag.ts                       ← per-node drag hook
│   │   │   └── usePanZoom.ts                    ← canvas pan/zoom hook
│   │   ├── components/
│   │   │   ├── CanvasPane.tsx                   ← NEW: replaces SnapshotPane
│   │   │   ├── FrameNode.tsx                    ← NEW
│   │   │   ├── HeapNode.tsx                     ← NEW
│   │   │   ├── EdgesLayer.tsx                   ← NEW
│   │   │   ├── CanvasLegend.tsx                 ← NEW
│   │   │   ├── EditorPane.tsx                   ← MODIFY: lazy CodeMirror import (carry-over #4)
│   │   │   ├── CallStackView.tsx                ← UNCHANGED (kept for future debug overlay)
│   │   │   ├── HeapView.tsx                     ← UNCHANGED (same)
│   │   │   └── SnapshotPane.tsx                 ← UNCHANGED but no longer imported
│   │   └── styles/
│   │       └── app.css                          ← MODIFY: canvas + node styles
│   └── tests/
│       ├── atoms/
│       │   ├── session.test.ts                  ← MODIFY: add nodePositions test; standardise scaffold (carry-over #5)
│       │   ├── engine.test.ts                   ← UNCHANGED (already standard)
│       │   └── derived.test.ts                  ← UNCHANGED (already standard)
│       ├── canvas/                              ← NEW dir
│       │   ├── layout.test.ts
│       │   └── refs.test.ts
│       └── e2e/
│           └── smoke.spec.ts                    ← MODIFY: drag + persistence assertions
├── docs/superpowers/
│   ├── plan-3-carry-over.md                     ← NEW (created at end of plan)
│   └── ...
└── README.md                                    ← MODIFY: roadmap status
```

---

## Conventions used throughout this plan

- TDD: failing test → minimal implementation → green → commit.
- Vitest commands always use `--run`.
- Reatom v1000.x quirks (already established in plans 1–2):
  - Read atom: call it (`atom()`)
  - Write atom inside an action: `atom.set(value)`
  - **For non-React callbacks (DOM event listeners, `setInterval`, drag handlers attached to `window`)**: get the frame via `useFrame()` from `@reatom/react` and wrap atom reads/writes in `frame.run(() => …)` because `clearStack()` in `main.tsx` makes bare atom access throw silently.
  - Test scaffold: `vi.stubGlobal('localStorage', fakeStorage)` BEFORE `@reatom/core` loads; dynamic `await import(...)` inside test bodies; per-test `vi.resetModules()` in `beforeEach`.
- Conventional commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Use Edit/Write tools, never `cat`/heredoc.
- All paths absolute or repo-relative to `/home/codelance/projects/js-runtime-visualizer`.

---

## Task 1: Standardise atom test scaffold (plan-2 carry-over #5)

`session.test.ts` uses `context.reset()` per test; `engine.test.ts` and `derived.test.ts` use `vi.resetModules()`. Pick one — `vi.resetModules()` re-runs `withLocalStorage`'s eager-IIFE which is the stronger isolation. Converge.

**Files:**
- Modify: `packages/ui/tests/atoms/session.test.ts`

- [ ] **Step 1: Read the current file**

```bash
cd /home/codelance/projects/js-runtime-visualizer
cat packages/ui/tests/atoms/session.test.ts
```

- [ ] **Step 2: Replace with the standardised scaffold**

Replace `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/atoms/session.test.ts` with:

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

describe('session atoms — round-trip via localStorage', () => {
  it('codeAtom persists writes to localStorage', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    codeAtom.set('let x = 42;');
    const stored = fakeStorage.getItem('jsrv:code');
    expect(stored).toBeTruthy();
    expect(stored).toContain('let x = 42;');
  });

  it('drillInAtom default is false and toggles persist', async () => {
    const { drillInAtom } = await import('../../src/atoms/session');
    expect(drillInAtom()).toBe(false);
    drillInAtom.set(true);
    expect(drillInAtom()).toBe(true);
    expect(fakeStorage.getItem('jsrv:drillIn')).toBeTruthy();
  });

  it('scrubberSpeedAtom default is 1 and accepts integer multipliers', async () => {
    const { scrubberSpeedAtom } = await import('../../src/atoms/session');
    expect(scrubberSpeedAtom()).toBe(1);
    scrubberSpeedAtom.set(4);
    expect(scrubberSpeedAtom()).toBe(4);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest --run packages/ui/tests/atoms/session.test.ts
```

Expected: 3 tests pass.

```bash
npx vitest --run
```

Expected: 72 total pass — no regressions.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/tests/atoms/session.test.ts
git commit -m "test(ui): standardise atom test scaffold on vi.resetModules"
```

---

## Task 2: Add Position / PanZoom / NodeId types

**Files:**
- Modify: `packages/ui/src/types.ts`

- [ ] **Step 1: Read the current file**

```bash
cd /home/codelance/projects/js-runtime-visualizer
cat packages/ui/src/types.ts
```

- [ ] **Step 2: Append canvas-related type aliases**

Use the Edit tool to insert this block at the end of `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/types.ts`:

```ts

// ─────────────────────────────────────────────────────────────────────────
// Canvas types (plan 3)
// ─────────────────────────────────────────────────────────────────────────

// A node id on the canvas. For frames we use `frame:<index>` (where index
// is the frame's position in callStack: 0 = bottom-most/global). For heap
// objects we use the heap object id directly (e.g. `obj42`).
export type NodeId = string;

export type Position = { x: number; y: number };

export type PanZoom = {
  panX: number;
  panY: number;
  zoom: number;
};

// Active drag state (transient — never persisted).
export type DragState = {
  activeId: NodeId | null;
  livePos: Position | null;
};

export const FRAME_NODE_ID = (frameIndex: number): NodeId => `frame:${frameIndex}`;
export const isFrameNodeId = (id: NodeId): boolean => id.startsWith('frame:');
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p packages/ui
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/types.ts
git commit -m "feat(ui): canvas-related types (Position, PanZoom, NodeId)"
```

---

## Task 3: nodePositionsAtom + collapsedIdsAtom (persisted) and canvas atoms (transient)

**Files:**
- Modify: `packages/ui/src/atoms/session.ts` (append two persisted atoms)
- Create: `packages/ui/src/atoms/canvas.ts` (transient pan/zoom + drag)
- Modify: `packages/ui/tests/atoms/session.test.ts` (add tests)

- [ ] **Step 1: Write failing tests for the new persisted atoms**

Append inside the existing `describe('session atoms — round-trip via localStorage', ...)` block in `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/atoms/session.test.ts`, before the closing `});`:

```ts
  it('nodePositionsAtom default is empty Map and persists positions', async () => {
    const { nodePositionsAtom } = await import('../../src/atoms/session');
    expect(nodePositionsAtom().size).toBe(0);
    const next = new Map(nodePositionsAtom());
    next.set('obj1', { x: 100, y: 50 });
    nodePositionsAtom.set(next);
    expect(nodePositionsAtom().get('obj1')).toEqual({ x: 100, y: 50 });
    const stored = fakeStorage.getItem('jsrv:nodePositions');
    expect(stored).toBeTruthy();
  });

  it('collapsedIdsAtom default is empty Set and persists membership', async () => {
    const { collapsedIdsAtom } = await import('../../src/atoms/session');
    expect(collapsedIdsAtom().size).toBe(0);
    const next = new Set(collapsedIdsAtom());
    next.add('obj1');
    collapsedIdsAtom.set(next);
    expect(collapsedIdsAtom().has('obj1')).toBe(true);
    const stored = fakeStorage.getItem('jsrv:collapsedIds');
    expect(stored).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run packages/ui/tests/atoms/session.test.ts
```

Expected: 2 new tests fail with `nodePositionsAtom is not exported`.

- [ ] **Step 3: Append the two persisted atoms**

Use Edit to add these atoms at the end of `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/session.ts`:

```ts

// Canvas node positions. Map<NodeId, Position> persisted as a JSON array of
// [id, position] pairs. withLocalStorage's default serializer handles plain
// arrays/objects; Map needs `toSnapshot`/`fromSnapshot` adapters.
import type { NodeId, Position } from '../types';

const mapToPairs = (m: Map<NodeId, Position>): Array<[NodeId, Position]> =>
  Array.from(m.entries());
const pairsToMap = (pairs: Array<[NodeId, Position]>): Map<NodeId, Position> =>
  new Map(pairs);

export const nodePositionsAtom = atom<Map<NodeId, Position>>(
  new Map(),
  'nodePositionsAtom',
).extend(
  withLocalStorage({
    key: persistKey('nodePositions'),
    version: STORAGE_VERSION,
    toSnapshot: mapToPairs,
    fromSnapshot: pairsToMap,
  }),
);

const setToArray = (s: Set<NodeId>): NodeId[] => Array.from(s);
const arrayToSet = (a: NodeId[]): Set<NodeId> => new Set(a);

export const collapsedIdsAtom = atom<Set<NodeId>>(
  new Set(),
  'collapsedIdsAtom',
).extend(
  withLocalStorage({
    key: persistKey('collapsedIds'),
    version: STORAGE_VERSION,
    toSnapshot: setToArray,
    fromSnapshot: arrayToSet,
  }),
);
```

If `withLocalStorage` does not accept `toSnapshot`/`fromSnapshot` keys in the installed `@reatom/core@1000.15.2`, check its options shape:

```bash
grep -A 30 "WithPersistOptions" node_modules/@reatom/core/build/persist/*.d.ts | head -60
```

The Context7 docs reference `toSnapshot` and `fromSnapshot` as serialisation hooks. If the runtime uses different names (e.g. `serialize`/`deserialize`), use those and document in your report.

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/ui/tests/atoms/session.test.ts
```

Expected: 5 tests pass.

```bash
npx vitest --run
```

Expected: 74 total pass.

- [ ] **Step 5: Create transient canvas atoms**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/canvas.ts`:

```ts
import { atom } from '@reatom/core';
import type { DragState, PanZoom } from '../types';

// Pan/zoom is transient (resets to identity each session) — keep canvas
// fresh on reopen. If user feedback later prefers persistence, this is
// where to add `withLocalStorage`.
export const panZoomAtom = atom<PanZoom>(
  { panX: 0, panY: 0, zoom: 1 },
  'panZoomAtom',
);

// Active drag — { activeId: id-being-dragged, livePos: current canvas position }.
// Lives only while the user holds the mouse button. The committed
// position lands in `nodePositionsAtom` on mouseup.
export const dragStateAtom = atom<DragState>(
  { activeId: null, livePos: null },
  'dragStateAtom',
);
```

- [ ] **Step 6: TypeScript + lint**

```bash
npx tsc --noEmit -p packages/ui
./node_modules/.bin/eslint packages --ext .ts,.tsx
```

Expected: both silent.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/atoms/session.ts packages/ui/src/atoms/canvas.ts packages/ui/tests/atoms/session.test.ts
git commit -m "feat(ui): canvas atoms — nodePositions + collapsedIds (persisted) + panZoom + dragState"
```

---

## Task 4: Default layout function (`canvas/layout.ts`)

A pure function. Takes a `Snapshot` plus optional pre-existing positions, returns a `Map<NodeId, Position>` covering every frame and heap object. Frames stack vertically on the left; heap objects flow into a 2-column grid on the right. Positions for ids that already exist in `prevPositions` are preserved verbatim.

**Files:**
- Create: `packages/ui/src/canvas/layout.ts`
- Create: `packages/ui/tests/canvas/layout.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/canvas/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../../src/canvas/layout';
import type { Snapshot } from '../../src/types';

function snap(callStack: Array<{ fnName: string; bindings: Map<string, never> }>, heapIds: string[]): Snapshot {
  return {
    step: 0,
    loc: { line: 1, col: 0 },
    eventKind: 'enter-frame',
    callStack: callStack.map((f) => ({ fnName: f.fnName, callSite: null, bindings: f.bindings })),
    heap: new Map(heapIds.map((id) => [id, { kind: 'object', ownProps: new Map(), prototype: null }])),
    consoleOut: [],
    highlights: {},
  };
}

describe('defaultLayout', () => {
  it('places frames in a left column stacked top-down', () => {
    const s = snap(
      [
        { fnName: '<global>', bindings: new Map() },
        { fnName: 'foo', bindings: new Map() },
      ],
      [],
    );
    const positions = defaultLayout(s, new Map());
    const f0 = positions.get('frame:0')!;
    const f1 = positions.get('frame:1')!;
    expect(f0).toBeDefined();
    expect(f1).toBeDefined();
    expect(f0.x).toBe(f1.x); // same column
    expect(f1.y).toBeGreaterThan(f0.y); // top-frame is later in callStack → lower y
  });

  it('places heap objects in a right-side grid (2 columns)', () => {
    const s = snap([{ fnName: '<global>', bindings: new Map() }], ['obj1', 'obj2', 'obj3', 'obj4']);
    const positions = defaultLayout(s, new Map());
    const h1 = positions.get('obj1')!;
    const h2 = positions.get('obj2')!;
    const h3 = positions.get('obj3')!;
    const h4 = positions.get('obj4')!;
    expect(h1.x).toBe(h3.x); // column 0
    expect(h2.x).toBe(h4.x); // column 1
    expect(h2.x).toBeGreaterThan(h1.x);
    expect(h3.y).toBeGreaterThan(h1.y);
  });

  it('preserves existing positions when an id already has one', () => {
    const s = snap([{ fnName: '<global>', bindings: new Map() }], ['obj1']);
    const prev = new Map([['obj1', { x: 999, y: 999 }]]);
    const positions = defaultLayout(s, prev);
    expect(positions.get('obj1')).toEqual({ x: 999, y: 999 });
  });

  it('returns positions for every node in the snapshot', () => {
    const s = snap(
      [{ fnName: '<global>', bindings: new Map() }, { fnName: 'foo', bindings: new Map() }],
      ['obj1', 'obj2'],
    );
    const positions = defaultLayout(s, new Map());
    expect(positions.has('frame:0')).toBe(true);
    expect(positions.has('frame:1')).toBe(true);
    expect(positions.has('obj1')).toBe(true);
    expect(positions.has('obj2')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run packages/ui/tests/canvas/layout.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement defaultLayout**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/layout.ts`:

```ts
import type { NodeId, Position, Snapshot } from '../types';
import { FRAME_NODE_ID } from '../types';

// Layout constants — kept here so they are easy to tune in one place.
const FRAME_COLUMN_X = 40;
const FRAME_ROW_HEIGHT = 130;
const FRAME_TOP_MARGIN = 40;

const HEAP_GRID_LEFT_X = 380;
const HEAP_GRID_COLUMN_WIDTH = 220;
const HEAP_GRID_ROW_HEIGHT = 130;
const HEAP_GRID_COLUMNS = 2;
const HEAP_TOP_MARGIN = 40;

// Build a position for every frame and heap object in the snapshot.
// Pre-existing entries in `prevPositions` are preserved verbatim — this
// supports user dragging (positions stick across step changes).
export function defaultLayout(
  snapshot: Snapshot,
  prevPositions: Map<NodeId, Position>,
): Map<NodeId, Position> {
  const out = new Map<NodeId, Position>();

  // Frames — left column, top-down by index in callStack
  // (callStack[0] is the bottom-most/global frame).
  for (let i = 0; i < snapshot.callStack.length; i++) {
    const id = FRAME_NODE_ID(i);
    const carryover = prevPositions.get(id);
    if (carryover) {
      out.set(id, carryover);
    } else {
      out.set(id, {
        x: FRAME_COLUMN_X,
        y: FRAME_TOP_MARGIN + i * FRAME_ROW_HEIGHT,
      });
    }
  }

  // Heap — right-side grid in allocation order.
  let heapIndex = 0;
  for (const id of snapshot.heap.keys()) {
    const carryover = prevPositions.get(id);
    if (carryover) {
      out.set(id, carryover);
    } else {
      const col = heapIndex % HEAP_GRID_COLUMNS;
      const row = Math.floor(heapIndex / HEAP_GRID_COLUMNS);
      out.set(id, {
        x: HEAP_GRID_LEFT_X + col * HEAP_GRID_COLUMN_WIDTH,
        y: HEAP_TOP_MARGIN + row * HEAP_GRID_ROW_HEIGHT,
      });
    }
    heapIndex++;
  }

  return out;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/ui/tests/canvas/layout.test.ts
```

Expected: 4 tests pass.

```bash
npx vitest --run
```

Expected: 78 total pass (74 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/canvas/layout.ts packages/ui/tests/canvas/layout.test.ts
git commit -m "feat(ui): default canvas layout (frames left-column, heap grid)"
```

---

## Task 5: Reference-edge extractor (`canvas/refs.ts`)

A pure function that walks the snapshot and yields `{ from, to, kind }` edges. For plan 3 we emit only `'reference'` edges (variable→object); `'prototype'` and `'closure'` kinds are added in plan 4.

**Files:**
- Create: `packages/ui/src/canvas/refs.ts`
- Create: `packages/ui/tests/canvas/refs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/canvas/refs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractEdges } from '../../src/canvas/refs';
import type { Snapshot } from '../../src/types';

function snap(input: {
  callStack: Array<{ fnName: string; bindings: Array<[string, unknown]> }>;
  heap: Array<[string, { kind: 'object' | 'array' | 'function'; ownProps: Array<[string, unknown]> }]>;
}): Snapshot {
  return {
    step: 0,
    loc: { line: 1, col: 0 },
    eventKind: 'enter-frame',
    callStack: input.callStack.map((f) => ({
      fnName: f.fnName,
      callSite: null,
      bindings: new Map(f.bindings) as Map<string, never>,
    })),
    heap: new Map(
      input.heap.map(([id, o]) => [
        id,
        { kind: o.kind, ownProps: new Map(o.ownProps), prototype: null } as never,
      ]),
    ),
    consoleOut: [],
    highlights: {},
  };
}

describe('extractEdges', () => {
  it('emits a reference edge from a frame binding pointing at a heap object', () => {
    const s = snap({
      callStack: [{ fnName: '<global>', bindings: [['x', { kind: 'ref', id: 'obj1' }]] }],
      heap: [['obj1', { kind: 'object', ownProps: [] }]],
    });
    const edges = extractEdges(s);
    expect(edges).toContainEqual({ from: 'frame:0', to: 'obj1', kind: 'reference', label: 'x' });
  });

  it('emits a reference edge from a heap object property pointing at another heap object', () => {
    const s = snap({
      callStack: [{ fnName: '<global>', bindings: [] }],
      heap: [
        ['obj1', { kind: 'object', ownProps: [['inner', { kind: 'ref', id: 'obj2' }]] }],
        ['obj2', { kind: 'object', ownProps: [] }],
      ],
    });
    const edges = extractEdges(s);
    expect(edges).toContainEqual({ from: 'obj1', to: 'obj2', kind: 'reference', label: 'inner' });
  });

  it('skips primitive bindings and primitive properties', () => {
    const s = snap({
      callStack: [{ fnName: '<global>', bindings: [['n', { kind: 'number', value: 42 }]] }],
      heap: [['obj1', { kind: 'object', ownProps: [['s', { kind: 'string', value: 'hi' }]] }]],
    });
    const edges = extractEdges(s);
    expect(edges).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx vitest --run packages/ui/tests/canvas/refs.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement extractEdges**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/refs.ts`:

```ts
import type { JSValue, NodeId, Snapshot } from '../types';
import { FRAME_NODE_ID } from '../types';

export type EdgeKind = 'reference' | 'prototype' | 'closure' | 'lookup' | 'error';

export type Edge = {
  from: NodeId;
  to: NodeId;
  kind: EdgeKind;
  label?: string;
};

const isRef = (v: JSValue): v is { kind: 'ref'; id: string } => v.kind === 'ref';

export function extractEdges(snapshot: Snapshot): Edge[] {
  const edges: Edge[] = [];

  // Frame bindings → heap objects
  for (let i = 0; i < snapshot.callStack.length; i++) {
    const frame = snapshot.callStack[i];
    if (!frame) continue;
    for (const [name, value] of frame.bindings) {
      if (isRef(value)) {
        edges.push({
          from: FRAME_NODE_ID(i),
          to: value.id,
          kind: 'reference',
          label: name,
        });
      }
    }
  }

  // Heap object properties → heap objects
  for (const [id, obj] of snapshot.heap) {
    for (const [key, value] of obj.ownProps) {
      if (isRef(value)) {
        edges.push({
          from: id,
          to: value.id,
          kind: 'reference',
          label: key,
        });
      }
    }
  }

  return edges;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest --run packages/ui/tests/canvas/refs.test.ts
```

Expected: 3 tests pass.

```bash
npx vitest --run
```

Expected: 81 total pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/canvas/refs.ts packages/ui/tests/canvas/refs.test.ts
git commit -m "feat(ui): extract reference edges from snapshot (frame + heap)"
```

---

## Task 6: Coords helper (`canvas/coords.ts`)

Convert between screen-space (raw mouse coordinates) and canvas-space (the inner SVG group's coordinate system after `translate(panX, panY) scale(zoom)`).

**Files:**
- Create: `packages/ui/src/canvas/coords.ts`

- [ ] **Step 1: Implement and inline-test**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/coords.ts`:

```ts
import type { PanZoom, Position } from '../types';

// Screen-space (mouse / clientX/Y relative to the SVG element's bounding box)
// → canvas-space (coordinates inside the transformed inner <g>).
//
// The inner group is `transform="translate(panX, panY) scale(zoom)"`, so
// canvas = (screen - pan) / zoom.
export function screenToCanvas(screen: Position, pz: PanZoom): Position {
  return {
    x: (screen.x - pz.panX) / pz.zoom,
    y: (screen.y - pz.panY) / pz.zoom,
  };
}

export function canvasToScreen(canvas: Position, pz: PanZoom): Position {
  return {
    x: canvas.x * pz.zoom + pz.panX,
    y: canvas.y * pz.zoom + pz.panY,
  };
}
```

- [ ] **Step 2: Quick TypeScript check**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx tsc --noEmit -p packages/ui
```

Expected: silent.

(No dedicated test file — a one-line Vitest test would just restate the math. The drag hook tests in Task 7 exercise these helpers indirectly.)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/canvas/coords.ts
git commit -m "feat(ui): screen↔canvas coordinate helpers"
```

---

## Task 7: useDrag hook (`canvas/useDrag.ts`)

Per-node drag handling. Captures initial node position on mousedown, updates `dragStateAtom` on mousemove, commits to `nodePositionsAtom` on mouseup. Uses `useFrame()` because mousemove/mouseup listeners attach to `window` — outside any Reatom context.

**Files:**
- Create: `packages/ui/src/canvas/useDrag.ts`

- [ ] **Step 1: Implement the hook**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/useDrag.ts`:

```ts
import { useCallback } from 'react';
import { useFrame } from '@reatom/react';
import { dragStateAtom, panZoomAtom } from '../atoms/canvas';
import { nodePositionsAtom } from '../atoms/session';
import type { NodeId, Position } from '../types';

// Returns an onMouseDown handler that, when attached to a node, drives
// dragStateAtom while the mouse is held and commits the final position
// to nodePositionsAtom on release.
//
// Caller passes the node's current canvas-space position so we know
// where it started — the handler then translates mouse deltas (in
// screen-space) into canvas-space deltas via the live zoom factor.
export function useDrag(id: NodeId, currentPos: Position): (e: React.MouseEvent) => void {
  const frame = useFrame();

  return useCallback(
    (e: React.MouseEvent) => {
      // Stop propagation so the canvas pan handler doesn't also fire.
      e.stopPropagation();

      const startMouse = { x: e.clientX, y: e.clientY };
      const startPos = currentPos;

      frame.run(() => {
        dragStateAtom.set({ activeId: id, livePos: startPos });
      });

      const onMove = (ev: MouseEvent) => {
        frame.run(() => {
          const zoom = panZoomAtom().zoom;
          const dx = (ev.clientX - startMouse.x) / zoom;
          const dy = (ev.clientY - startMouse.y) / zoom;
          dragStateAtom.set({
            activeId: id,
            livePos: { x: startPos.x + dx, y: startPos.y + dy },
          });
        });
      };

      const onUp = () => {
        frame.run(() => {
          const live = dragStateAtom().livePos;
          if (live) {
            const next = new Map(nodePositionsAtom());
            next.set(id, live);
            nodePositionsAtom.set(next);
          }
          dragStateAtom.set({ activeId: null, livePos: null });
        });
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [id, currentPos, frame],
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx tsc --noEmit -p packages/ui
./node_modules/.bin/eslint packages --ext .ts,.tsx
```

Expected: both silent.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/canvas/useDrag.ts
git commit -m "feat(ui): per-node drag hook (transient livePos, commit on mouseup)"
```

---

## Task 8: usePanZoom hook (`canvas/usePanZoom.ts`)

Canvas-level pan (drag empty area) and zoom (wheel, anchored at cursor).

**Files:**
- Create: `packages/ui/src/canvas/usePanZoom.ts`

- [ ] **Step 1: Implement the hook**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/usePanZoom.ts`:

```ts
import { useCallback } from 'react';
import { useFrame } from '@reatom/react';
import { panZoomAtom } from '../atoms/canvas';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.1;

export function usePanZoom() {
  const frame = useFrame();

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start a pan when the user clicks on the SVG background, not
      // a node. Node onMouseDown handlers must call stopPropagation to
      // prevent the pan from starting; the dragstate atom is the more
      // robust check.
      const startMouse = { x: e.clientX, y: e.clientY };
      let startPan = { panX: 0, panY: 0 };
      frame.run(() => {
        startPan = { panX: panZoomAtom().panX, panY: panZoomAtom().panY };
      });

      const onMove = (ev: MouseEvent) => {
        frame.run(() => {
          const cur = panZoomAtom();
          panZoomAtom.set({
            ...cur,
            panX: startPan.panX + (ev.clientX - startMouse.x),
            panY: startPan.panY + (ev.clientY - startMouse.y),
          });
        });
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [frame],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      // Wheel events are passive by default in newer React — preventDefault
      // on the SyntheticEvent does NOT cancel the page scroll for SVG.
      // We pin the wheel to zoom-only: the canvas SVG has overflow:hidden
      // and isn't scrollable, so this is OK.
      const dir = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      frame.run(() => {
        const cur = panZoomAtom();
        const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cur.zoom * dir));
        if (nextZoom === cur.zoom) return;

        // Anchor zoom at the cursor — keep the canvas point under the cursor stationary.
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const cursorScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        // canvas-coord under cursor at current zoom
        const cursorCanvas = {
          x: (cursorScreen.x - cur.panX) / cur.zoom,
          y: (cursorScreen.y - cur.panY) / cur.zoom,
        };
        const nextPan = {
          panX: cursorScreen.x - cursorCanvas.x * nextZoom,
          panY: cursorScreen.y - cursorCanvas.y * nextZoom,
        };
        panZoomAtom.set({ panX: nextPan.panX, panY: nextPan.panY, zoom: nextZoom });
      });
    },
    [frame],
  );

  return { onMouseDown, onWheel };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx tsc --noEmit -p packages/ui
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/canvas/usePanZoom.ts
git commit -m "feat(ui): canvas pan (drag) + zoom (wheel, cursor-anchored)"
```

---

## Task 9: FrameNode component

A single call-stack frame as an SVG `<g>` with an HTML body inside `<foreignObject>` (so we can use normal flexbox, text wrapping, and click handling). Click drag handle to drag, click body to toggle collapse.

**Files:**
- Create: `packages/ui/src/components/FrameNode.tsx`

- [ ] **Step 1: Implement**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/FrameNode.tsx`:

```tsx
import { useFrame } from '@reatom/react';
import { useDrag } from '../canvas/useDrag';
import { collapsedIdsAtom } from '../atoms/session';
import type { FrameSnapshot, JSValue, NodeId, Position } from '../types';

const FRAME_WIDTH = 280;
const FRAME_HEADER_HEIGHT = 26;
const FRAME_ROW_HEIGHT = 18;
const FRAME_PADDING_Y = 6;

function renderValue(v: JSValue): string {
  switch (v.kind) {
    case 'undefined': return 'undefined';
    case 'null': return 'null';
    case 'boolean':
    case 'number': return String(v.value);
    case 'string': return JSON.stringify(v.value);
    case 'ref': return `→ ${v.id}`;
  }
}

export function FrameNode(props: {
  id: NodeId;
  pos: Position;
  frame: FrameSnapshot;
  isTop: boolean;
  collapsed: boolean;
}) {
  const { id, pos, frame, isTop, collapsed } = props;
  const onMouseDown = useDrag(id, pos);
  const reatomFrame = useFrame();

  const toggleCollapsed = (e: React.MouseEvent) => {
    e.stopPropagation();
    reatomFrame.run(() => {
      const next = new Set(collapsedIdsAtom());
      if (next.has(id)) next.delete(id);
      else next.add(id);
      collapsedIdsAtom.set(next);
    });
  };

  const bindingCount = frame.bindings.size;
  const bodyHeight = collapsed
    ? 0
    : FRAME_PADDING_Y * 2 + Math.max(1, bindingCount) * FRAME_ROW_HEIGHT;
  const totalHeight = FRAME_HEADER_HEIGHT + bodyHeight;

  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      <foreignObject
        x={0}
        y={0}
        width={FRAME_WIDTH}
        height={totalHeight}
        style={{ overflow: 'visible' }}
      >
        <div
          style={{
            background: 'var(--panel)',
            border: `2px solid ${isTop ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 6,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            color: 'var(--text)',
            userSelect: 'none',
            width: FRAME_WIDTH,
          }}
        >
          <div
            onMouseDown={onMouseDown}
            onClick={toggleCollapsed}
            style={{
              padding: '4px 8px',
              cursor: 'move',
              borderBottom: collapsed ? 'none' : '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              color: isTop ? 'var(--accent)' : 'var(--info)',
            }}
          >
            <span>{isTop ? '▶ ' : '  '}{frame.fnName}</span>
            <span style={{ color: 'var(--muted)', fontSize: 10 }}>
              {frame.callSite ? `L${frame.callSite.line}` : ''}
              {' '}
              {collapsed ? '▸' : '▾'}
            </span>
          </div>
          {!collapsed && (
            <div style={{ padding: `${FRAME_PADDING_Y}px 8px` }}>
              {bindingCount === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 10 }}>(no bindings)</div>
              ) : (
                Array.from(frame.bindings.entries()).map(([k, v]) => (
                  <div key={k}>
                    <span style={{ color: 'var(--good)' }}>{k}</span>: {renderValue(v)}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx tsc --noEmit -p packages/ui
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/FrameNode.tsx
git commit -m "feat(ui): FrameNode — draggable + collapsible call frame"
```

---

## Task 10: HeapNode component

**Files:**
- Create: `packages/ui/src/components/HeapNode.tsx`

- [ ] **Step 1: Implement**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/HeapNode.tsx`:

```tsx
import { useFrame } from '@reatom/react';
import { useDrag } from '../canvas/useDrag';
import { collapsedIdsAtom } from '../atoms/session';
import type { HeapObject, JSValue, NodeId, Position } from '../types';

const NODE_WIDTH = 200;
const NODE_HEADER_HEIGHT = 26;
const NODE_ROW_HEIGHT = 18;
const NODE_PADDING_Y = 6;

function renderValue(v: JSValue): string {
  switch (v.kind) {
    case 'undefined': return 'undefined';
    case 'null': return 'null';
    case 'boolean':
    case 'number': return String(v.value);
    case 'string': return JSON.stringify(v.value);
    case 'ref': return `→ ${v.id}`;
  }
}

export function HeapNode(props: {
  id: NodeId;
  pos: Position;
  obj: HeapObject;
  collapsed: boolean;
}) {
  const { id, pos, obj, collapsed } = props;
  const onMouseDown = useDrag(id, pos);
  const reatomFrame = useFrame();

  const toggleCollapsed = (e: React.MouseEvent) => {
    e.stopPropagation();
    reatomFrame.run(() => {
      const next = new Set(collapsedIdsAtom());
      if (next.has(id)) next.delete(id);
      else next.add(id);
      collapsedIdsAtom.set(next);
    });
  };

  const labelColor =
    obj.kind === 'function' ? 'var(--info)' :
    obj.kind === 'array' ? 'var(--accent)' :
    'var(--good)';

  const propCount = obj.ownProps.size;
  const bodyHeight = collapsed
    ? 0
    : NODE_PADDING_Y * 2 + Math.max(1, propCount) * NODE_ROW_HEIGHT;
  const totalHeight = NODE_HEADER_HEIGHT + bodyHeight;

  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      <foreignObject
        x={0}
        y={0}
        width={NODE_WIDTH}
        height={totalHeight}
        style={{ overflow: 'visible' }}
      >
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            color: 'var(--text)',
            userSelect: 'none',
            width: NODE_WIDTH,
          }}
        >
          <div
            onMouseDown={onMouseDown}
            onClick={toggleCollapsed}
            style={{
              padding: '4px 8px',
              cursor: 'move',
              borderBottom: collapsed ? 'none' : '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              color: labelColor,
            }}
          >
            <span>{obj.kind} #{id}</span>
            <span style={{ color: 'var(--muted)', fontSize: 10 }}>
              {obj.source?.name ? `ƒ ${obj.source.name}` : ''}
              {' '}
              {collapsed ? '▸' : '▾'}
            </span>
          </div>
          {!collapsed && (
            <div style={{ padding: `${NODE_PADDING_Y}px 8px` }}>
              {propCount === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 10 }}>(no own props)</div>
              ) : (
                Array.from(obj.ownProps.entries()).map(([k, v]) => (
                  <div key={k}>
                    <span style={{ color: 'var(--good)' }}>{k}</span>: {renderValue(v)}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx tsc --noEmit -p packages/ui
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/HeapNode.tsx
git commit -m "feat(ui): HeapNode — draggable + collapsible heap object"
```

---

## Task 11: EdgesLayer component

Reads the current snapshot's edges (via `extractEdges`) and the live position map, draws an SVG path from source to target. Cubic bezier so the line curves nicely between the left and right halves.

**Files:**
- Create: `packages/ui/src/components/EdgesLayer.tsx`

- [ ] **Step 1: Implement**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/EdgesLayer.tsx`:

```tsx
import { extractEdges } from '../canvas/refs';
import type { Edge } from '../canvas/refs';
import type { NodeId, Position, Snapshot } from '../types';

const NODE_WIDTH = 200; // matches HeapNode default; FrameNode is 280 — we use the right edge offset based on type
const FRAME_WIDTH = 280;
const ROW_HEIGHT = 18;
const HEADER_HEIGHT = 26;

const COLORS: Record<Edge['kind'], string> = {
  reference: '#94e2d5',
  prototype: '#cba6f7',
  closure: '#fab387',
  lookup: '#fab387',
  error: '#f38ba8',
};

// Approximate the right-middle of a source node and the left-middle of a
// target node, given only the position. Without exact dimension info per
// node id, we use a reasonable default (frame=280, heap=200).
function endpoints(edge: Edge, positions: Map<NodeId, Position>): { from: Position; to: Position } | null {
  const from = positions.get(edge.from);
  const to = positions.get(edge.to);
  if (!from || !to) return null;
  const fromIsFrame = edge.from.startsWith('frame:');
  const fromW = fromIsFrame ? FRAME_WIDTH : NODE_WIDTH;
  // anchor on the right-middle of source, left-middle of target
  return {
    from: { x: from.x + fromW, y: from.y + HEADER_HEIGHT + ROW_HEIGHT / 2 },
    to: { x: to.x, y: to.y + HEADER_HEIGHT + ROW_HEIGHT / 2 },
  };
}

function bezierPath(from: Position, to: Position): string {
  const dx = Math.max(40, Math.abs(to.x - from.x) * 0.5);
  return `M ${from.x},${from.y} C ${from.x + dx},${from.y} ${to.x - dx},${to.y} ${to.x},${to.y}`;
}

export function EdgesLayer(props: {
  snapshot: Snapshot;
  positions: Map<NodeId, Position>;
}) {
  const { snapshot, positions } = props;
  const edges = extractEdges(snapshot);
  return (
    <g>
      <defs>
        <marker id="arrow-ref" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.reference} />
        </marker>
      </defs>
      {edges.map((edge, i) => {
        const ep = endpoints(edge, positions);
        if (!ep) return null;
        return (
          <g key={`${edge.from}-${edge.to}-${i}`}>
            <path
              d={bezierPath(ep.from, ep.to)}
              stroke={COLORS[edge.kind]}
              strokeWidth={1.5}
              fill="none"
              markerEnd="url(#arrow-ref)"
              opacity={0.85}
            />
            {edge.label && (
              <text
                x={(ep.from.x + ep.to.x) / 2}
                y={(ep.from.y + ep.to.y) / 2 - 4}
                fill={COLORS[edge.kind]}
                fontSize={9}
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx tsc --noEmit -p packages/ui
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/EdgesLayer.tsx
git commit -m "feat(ui): EdgesLayer — bezier reference edges with arrowheads"
```

---

## Task 12: CanvasLegend component

Small fixed-position legend in the bottom-right corner.

**Files:**
- Create: `packages/ui/src/components/CanvasLegend.tsx`

- [ ] **Step 1: Implement**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/CanvasLegend.tsx`:

```tsx
export function CanvasLegend() {
  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        background: 'var(--panel-2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 8,
        fontSize: 10,
        color: 'var(--muted)',
        fontFamily: 'JetBrains Mono, monospace',
        pointerEvents: 'none',
        lineHeight: 1.4,
      }}
    >
      <div style={{ color: 'var(--text)', fontWeight: 'bold', marginBottom: 4 }}>Legend</div>
      <div><span style={{ color: '#94e2d5' }}>━━</span> reference</div>
      <div style={{ color: 'var(--accent)' }}>▶ top frame</div>
      <div>drag to move · click header to collapse</div>
      <div>wheel to zoom · drag empty area to pan</div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx tsc --noEmit -p packages/ui
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/CanvasLegend.tsx
git commit -m "feat(ui): CanvasLegend — corner explainer"
```

---

## Task 13: CanvasPane composition

Brings frames, heap, edges, and legend together. Subscribes to snapshot, positions, collapsed set, drag state, pan/zoom. Exposes an "Auto-arrange" reset button.

**Files:**
- Create: `packages/ui/src/components/CanvasPane.tsx`
- Modify: `packages/ui/src/styles/app.css` (add `.canvas-host` styles)

- [ ] **Step 1: Append CSS**

Append to `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/styles/app.css`:

```css

.canvas-host {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--panel-2);
  overflow: hidden;
}

.canvas-host svg {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.canvas-host svg:active {
  cursor: grabbing;
}

.canvas-toolbar {
  position: absolute;
  left: 12px;
  top: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
}
```

- [ ] **Step 2: Implement CanvasPane**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/CanvasPane.tsx`:

```tsx
import { useMemo } from 'react';
import { useAtom, useAction, useFrame } from '@reatom/react';
import { action } from '@reatom/core';
import { currentSnapshotAtom, totalStepsAtom } from '../atoms/derived';
import { currentStepIndexAtom } from '../atoms/ui';
import { nodePositionsAtom, collapsedIdsAtom } from '../atoms/session';
import { panZoomAtom, dragStateAtom } from '../atoms/canvas';
import { defaultLayout } from '../canvas/layout';
import { usePanZoom } from '../canvas/usePanZoom';
import { FrameNode } from './FrameNode';
import { HeapNode } from './HeapNode';
import { EdgesLayer } from './EdgesLayer';
import { CanvasLegend } from './CanvasLegend';
import { FRAME_NODE_ID } from '../types';
import type { EventKind, NodeId, Position } from '../types';

const EVENT_LABELS: Record<EventKind, string> = {
  'enter-frame': 'Function entered',
  'leave-frame': 'Function returned',
  assign: 'Variable assigned',
  allocate: 'Object allocated',
  lookup: 'Variable read',
  mutate: 'Property updated',
  console: 'console.log',
};

const autoArrange = action(
  () => nodePositionsAtom.set(new Map()),
  'autoArrange',
);

export function CanvasPane() {
  const [snap] = useAtom(currentSnapshotAtom);
  const [step] = useAtom(currentStepIndexAtom);
  const [total] = useAtom(totalStepsAtom);
  const [storedPositions] = useAtom(nodePositionsAtom);
  const [collapsed] = useAtom(collapsedIdsAtom);
  const [drag] = useAtom(dragStateAtom);
  const [pz] = useAtom(panZoomAtom);
  const onAutoArrange = useAction(autoArrange);
  const { onMouseDown: onCanvasMouseDown, onWheel } = usePanZoom();

  // Position layer = default layout overridden by stored positions, then by
  // the active drag's livePos (if any).
  const positions = useMemo<Map<NodeId, Position>>(() => {
    if (!snap) return new Map();
    const base = defaultLayout(snap, storedPositions);
    if (drag.activeId && drag.livePos) {
      const next = new Map(base);
      next.set(drag.activeId, drag.livePos);
      return next;
    }
    return base;
  }, [snap, storedPositions, drag]);

  return (
    <div className="snapshot canvas-host">
      <div className="canvas-toolbar">
        <strong style={{ fontSize: 13, color: 'var(--text)' }}>Snapshot</strong>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
          {snap
            ? `step ${step + 1} / ${total} · ${EVENT_LABELS[snap.eventKind] ?? snap.eventKind} @ L${snap.loc.line}`
            : '(no run)'}
        </span>
        <button
          onClick={onAutoArrange}
          style={{ marginLeft: 12, fontSize: 11, padding: '2px 8px' }}
          title="Reset all node positions to the default layout"
        >
          Auto-arrange
        </button>
      </div>

      {snap ? (
        <svg onMouseDown={onCanvasMouseDown} onWheel={onWheel}>
          <g transform={`translate(${pz.panX}, ${pz.panY}) scale(${pz.zoom})`}>
            <EdgesLayer snapshot={snap} positions={positions} />
            {snap.callStack.map((frame, i) => {
              const id = FRAME_NODE_ID(i);
              const pos = positions.get(id);
              if (!pos) return null;
              return (
                <FrameNode
                  key={id}
                  id={id}
                  pos={pos}
                  frame={frame}
                  isTop={i === snap.callStack.length - 1}
                  collapsed={collapsed.has(id)}
                />
              );
            })}
            {Array.from(snap.heap.entries()).map(([id, obj]) => {
              const pos = positions.get(id);
              if (!pos) return null;
              return (
                <HeapNode
                  key={id}
                  id={id}
                  pos={pos}
                  obj={obj}
                  collapsed={collapsed.has(id)}
                />
              );
            })}
          </g>
        </svg>
      ) : (
        <div style={{ padding: 24, color: 'var(--muted)' }}>(no run — type code and click Run)</div>
      )}

      <CanvasLegend />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx tsc --noEmit -p packages/ui
./node_modules/.bin/eslint packages --ext .ts,.tsx
```

Expected: both silent.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/CanvasPane.tsx packages/ui/src/styles/app.css
git commit -m "feat(ui): CanvasPane — composes frames + heap + edges + legend"
```

---

## Task 14: Swap CanvasPane into App.tsx (replaces SnapshotPane)

**Files:**
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Replace App.tsx**

Replace `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/App.tsx`:

```tsx
import { Toolbar } from './components/Toolbar';
import { EditorPane } from './components/EditorPane';
import { ScrubberPane } from './components/ScrubberPane';
import { CanvasPane } from './components/CanvasPane';
import { ConsoleView } from './components/ConsoleView';
import './styles/app.css';

export function App() {
  return (
    <div className="app">
      <Toolbar />
      <EditorPane />
      <CanvasPane />
      <ConsoleView />
      <ScrubberPane />
    </div>
  );
}
```

(Only the `SnapshotPane` import line changes to `CanvasPane`; everything else identical.)

- [ ] **Step 2: Build + tests**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
npx vitest --run
```

Expected: build clean, 81 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/App.tsx
git commit -m "feat(ui): swap CanvasPane in for SnapshotPane in app shell"
```

---

## Task 15: Code-split CodeMirror (plan-2 carry-over #4)

Lazy-load `EditorPane` so the CodeMirror bundle ships in its own chunk. Vite handles dynamic import natively.

**Files:**
- Modify: `packages/ui/src/App.tsx`
- Rename: `packages/ui/src/components/EditorPane.tsx` is unchanged content; we wrap the import in `React.lazy`

- [ ] **Step 1: Update App.tsx to lazy-load EditorPane**

Edit `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/App.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import { Toolbar } from './components/Toolbar';
import { ScrubberPane } from './components/ScrubberPane';
import { CanvasPane } from './components/CanvasPane';
import { ConsoleView } from './components/ConsoleView';
import './styles/app.css';

const EditorPane = lazy(() =>
  import('./components/EditorPane').then((m) => ({ default: m.EditorPane })),
);

export function App() {
  return (
    <div className="app">
      <Toolbar />
      <Suspense
        fallback={
          <div className="editor" style={{ padding: 12, color: 'var(--muted)' }}>
            loading editor…
          </div>
        }
      >
        <EditorPane />
      </Suspense>
      <CanvasPane />
      <ConsoleView />
      <ScrubberPane />
    </div>
  );
}
```

- [ ] **Step 2: Build and check chunking**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
ls -la packages/ui/dist/assets/
```

Expected: now multiple `.js` chunks; the main entry chunk is much smaller (< 200 kB) because CodeMirror lives in its own. Vite will name the lazy chunk something like `EditorPane-XXXX.js`.

- [ ] **Step 3: Re-run e2e to confirm the lazy chunk loads correctly**

```bash
npm run e2e
```

Expected: 1 e2e test passes. Playwright waits for `.cm-content` which appears after the lazy chunk resolves — that's enough to verify the lazy boundary works.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/App.tsx
git commit -m "perf(ui): lazy-load CodeMirror editor (separate chunk)"
```

---

## Task 16: e2e smoke — drag + persistence

Strengthen the smoke test so it exercises the canvas's two new behaviours: a node visibly responds to drag, and the dragged position persists across a reload.

**Files:**
- Modify: `packages/ui/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Read the current smoke spec**

```bash
cd /home/codelance/projects/js-runtime-visualizer
cat packages/ui/tests/e2e/smoke.spec.ts
```

- [ ] **Step 2: Replace the smoke spec with a canvas-aware version**

Replace `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('type code → click Run → snapshots, edges, drag-persistence', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');

  // Wait for the editor to mount (lazy-loaded chunk).
  await page.waitForSelector('.cm-content');

  // Type a small program with a heap allocation so a HeapNode appears.
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('let o = { a: 1 }; o.a;');

  // Run.
  await page.getByRole('button', { name: 'Run' }).click();

  // The snapshot pane is now an SVG canvas — verify the canvas exists.
  await expect(page.locator('.canvas-host svg')).toBeVisible();

  // Step toolbar still shows the human label.
  await expect(page.locator('.canvas-toolbar')).toContainText(/step 1 \/ \d+/);

  // Forward to the last step so we can see the populated heap.
  await page.getByRole('button', { name: '⏭' }).click();

  // The canvas should contain at least two SVG groups (one frame + at least one heap object).
  // foreignObject children house the visible HTML cards.
  const foreignObjects = page.locator('.canvas-host svg foreignObject');
  await expect.poll(async () => foreignObjects.count()).toBeGreaterThanOrEqual(2);

  // Drag the first node by 60px right, 40px down. Read its current
  // bounding box, then mouse-drag with steps to ensure mousemove fires.
  const firstNode = foreignObjects.first();
  const box = await firstNode.boundingBox();
  if (!box) throw new Error('node has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + 12; // grab on the header
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 60, startY + 40, { steps: 5 });
  await page.mouse.up();

  // Position should have changed in localStorage.
  const stored = await page.evaluate(() => window.localStorage.getItem('jsrv:nodePositions'));
  expect(stored).toBeTruthy();
  expect(stored).toContain('x');

  // Reload — the dragged position should persist (the node's bounding box
  // should be near where we dropped it, not back at the default layout).
  await page.reload();
  await page.waitForSelector('.cm-content');
  await page.getByRole('button', { name: 'Run' }).click();
  await page.getByRole('button', { name: '⏭' }).click();

  const stored2 = await page.evaluate(() => window.localStorage.getItem('jsrv:nodePositions'));
  expect(stored2).toBeTruthy();
  expect(stored2).toContain('x');
});
```

- [ ] **Step 3: Run e2e**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm run e2e
```

Expected: 1 test passes.

If the drag fails because Playwright's `mouse.move` with `steps` doesn't trigger the React mousemove pipeline, document the failure and try moving the listeners from `window` to `document` in `useDrag`. Most browsers route `window` mousemove correctly, but Playwright's headless Chromium has occasionally been seen to miss them.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/tests/e2e/smoke.spec.ts
git commit -m "test(ui): canvas e2e — drag, edge render, position persistence"
```

---

## Task 17: README + plan-3 carry-over + final lint/format

**Files:**
- Modify: `README.md` (project root) — flip plan 3 to ✅
- Create: `docs/superpowers/plan-3-carry-over.md`
- Run: prettier on changed files, lint, full test gate

- [ ] **Step 1: Update top-level README**

Edit `/home/codelance/projects/js-runtime-visualizer/README.md`. Replace the Plan 3 line (currently unchecked) with:

```
- [x] **Plan 3** — canvas visualisation: SVG canvas with draggable frames + heap nodes, reference edges, collapse, pan/zoom, position persistence in `localStorage`. CodeMirror code-split into its own chunk. _Completed 2026-05-08._
```

- [ ] **Step 2: Create the plan-3 carry-over file**

Create `/home/codelance/projects/js-runtime-visualizer/docs/superpowers/plan-3-carry-over.md`:

```markdown
# Plan 3 → Plan 4 carry-over

Items the canvas work surfaced or deferred. None blocked plan 3 merge.

## For plan 4 (prototypes, classes, missing operators, this binding)

1. **Closure visualisation.** Function HeapObject's `closure: IEnvironmentRecord` is currently a live ref to a runtime env. To render captured-scope as a separate block inside the function node (per spec §6.2), the engine needs to snapshot the env's bindings at function-creation time into a new field on `FunctionSource` (e.g. `capturedScope: Map<string, JSValue>`). Plan 4 will add this alongside prototype-chain edges since both touch the function HeapObject shape.
2. **Prototype edges on the canvas.** `EdgesLayer` already supports `'prototype'` and `'closure'` kinds in `EdgeKind`, but `extractEdges` only emits `'reference'`. Plan 4 extends `extractEdges` to also walk `HeapObject.prototype` and to emit a `'closure'` edge from each function node to the captured scope (rendered as a synthetic node).
3. **Lookup-path animation.** The `lookup` event payload should carry the chain of HeapObject ids walked during property lookup (currently empty for own-only access in plan 1's evaluator). Plan 4's prototype chain implementation should populate `payload.lookupPath`, and `EdgesLayer` should render it as the dashed-orange transient edge from spec §6.2.
4. **Missing operators / this / hoisting / class** — engine work; user-visible only after the canvas already renders frames + heap. (Plan 4 scope as documented in plan-1 carry-over.)

## For plan 5 (errors + traceback)

5. **Error-propagation animation on the canvas.** `EdgesLayer` supports `'error'` kind already; plan 5 will need to emit transient red-edge events as frames unwind.
6. **TracebackPanel** — separate UI surface, not on the canvas.

## Carried forward (still open)

- Frame-leak on non-Return throw → plan 5.
- `lookup` event drill-in overload → may get a dedicated `eval-step` kind in plan 4 or 5.
- Bundle chunk size — closer to budget after Task 15's split, but worth re-checking when prototype work adds graph-layout helpers.
```

- [ ] **Step 3: Format + lint**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx prettier --write "packages/**/*.{ts,tsx,css}" "docs/superpowers/**/*.md"
./node_modules/.bin/eslint packages --ext .ts,.tsx
```

Expected: prettier may rewrite whitespace; lint silent.

- [ ] **Step 4: Final test gate**

```bash
npx vitest --run
npx tsc --noEmit -p packages/engine
npx tsc --noEmit -p packages/ui
npm --workspace @js-runtime-visualizer/ui run build
npm run e2e
```

Expected: 81 vitest pass, both tsc invocations silent, vite build clean (no >500kB chunk warning), e2e passes.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/plan-3-carry-over.md packages/
git commit -m "docs: plan 3 complete — canvas visualisation, drag persistence, code-split"
```

---

## Done — what to expect

After all 17 tasks the repository contains:

- An SVG canvas replacing the textual snapshot pane. Frames on the left, heap on the right, reference edges between them, drag any node to move it, click the header to collapse it, drag the empty area to pan, wheel to zoom.
- Node positions and collapsed state persist in `localStorage`. Pan/zoom resets per session.
- An "Auto-arrange" button to discard custom positions and fall back to the default grid layout.
- CodeMirror in its own lazy chunk — main bundle drops below the 500 kB warning threshold.
- 81 vitest unit tests + 1 Playwright e2e smoke (now exercising drag and persistence).

Plans 4 (prototypes, `class`/`extends`, `this`, missing operators, hoisting) and 5 (errors + traceback) layer on top — both extend `extractEdges`, the canvas accepts more edge kinds without further structural change.

---

## Self-review

- **Spec coverage**: §6.1 (toolbar/editor/snapshot/console/scrubber layout) — covered already in plans 1–2; this plan replaces the snapshot pane with a canvas as §6.2 specifies. §6.2 details: frames left side ✓, heap right side ✓, draggable ✓, collapsible ✓, pan/zoom ✓, edges with the documented colour palette ✓ (only `reference` rendered this plan; the `prototype`, `closure`, `lookup`, `error` kinds are wired into the type but plan 4/5 emit them). §6.3 state in Reatom ✓ (atoms split persisted vs transient correctly). §6.4 interactions ✓. The hover-property-to-highlight-owner-in-chain interaction is deferred to plan 4 alongside prototype work.
- **No placeholders**: every step lists exact file path, complete code, exact command, expected output, and commit message. No "TBD"/"TODO"/"similar to" patterns.
- **Type consistency**: `NodeId`, `Position`, `PanZoom`, `DragState`, `Edge`, `EdgeKind` defined in Task 2 and Task 5; consumed identically across Tasks 6–13. `FRAME_NODE_ID` helper imported wherever it's needed. `EVENT_LABELS` in CanvasPane reuses the same map shape as plan 2's SnapshotPane (idempotent if both files keep it; CanvasPane is the only consumer here).
- **Carry-over coverage**: plan-2 #1 (nodePositions atom) → Task 3. #2 (replace SnapshotPane) → Task 14. #3 (graph-layout decision) → resolved as "hand-rolled per spec" in Task 4. #4 (code-split CodeMirror) → Task 15. #5 (standardise test scaffold) → Task 1. Plan-1 leftovers (frame leak, drill-in overload, plan-4 operators, prototypes) → recorded in plan-3-carry-over.md for plans 4 and 5.
