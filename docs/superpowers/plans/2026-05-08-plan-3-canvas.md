# Plan 3 — Canvas Visualisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the textual `SnapshotPane` with an interactive SVG canvas. Stack frames live as draggable, collapsible nodes on the left half; heap objects live on the right half; reference edges connect them. Pan + zoom on the canvas, persist node positions and collapsed state to `localStorage`.

**Architecture:** A single SVG element with a viewport `<g transform="translate(panX, panY) scale(zoom)">`. Children are positioned in canvas coordinates (atoms hold them per id). During a drag, a transient `dragStateAtom` holds the live position; on `mouseup` the final position commits to the persisted `nodePositionsAtom` (avoids 60+ localStorage writes/second). Reference edges (variable → object) are computed each render from the current snapshot; prototype/closure edges land in plan 4.

**Tech Stack:** Reuses plan-2 stack — Vite, React 18, TypeScript, Reatom 1000.x. No graph-layout library; positions are hand-rolled per spec §6.2 ("No graph-layout library. Initial positions ... user repositions.").

**Reference spec:** [`docs/superpowers/specs/2026-05-08-js-execution-visualizer-design.md`](../specs/2026-05-08-js-execution-visualizer-design.md) (§6 UI structure, §6.2 Canvas details)
**Plan 2 outcome:** [`docs/superpowers/plans/2026-05-08-plan-2-ui-shell.md`](./2026-05-08-plan-2-ui-shell.md)
**Carry-overs being addressed:** [`docs/superpowers/plan-2-carry-over.md`](../plan-2-carry-over.md) — items 1 (`nodePositions`), 2 (replace SnapshotPane), 3 (graph-layout decision: hand-rolled), 4 (code-split CodeMirror), 5 (standardise atom test scaffold).

**Out of scope (deferred):**
- Prototype-chain edges (solid violet `[[Prototype]]`, dotted grey `.prototype`) → plan 4 (they require prototype-chain support in evaluator).
- Closure visualisation (`[[Environment]]` block on function nodes, dashed orange "captured scope" frames) → plan 4 (requires snapshotting captured bindings on function allocation; engine work).
- Lookup path animation (dashed orange) → plan 4 alongside prototype-aware lookups.
- Error propagation (red unwind animation) → plan 5.

---

## File structure (created or modified by this plan)

```
js-runtime-visualizer/
├── packages/
│   └── ui/
│       ├── src/
│       │   ├── App.tsx                          ← MODIFY (swap SnapshotPane → CanvasPane)
│       │   ├── atoms/
│       │   │   ├── session.ts                   ← MODIFY (add nodePositionsAtom, collapsedIdsAtom)
│       │   │   └── canvas.ts                    ← NEW (panZoomAtom, dragStateAtom — transient)
│       │   ├── canvas/                          ← NEW DIR — pure helpers + hooks
│       │   │   ├── layout.ts                    ← defaultLayout(snapshot) → Map<id, {x,y}>
│       │   │   ├── refs.ts                      ← extractRefEdges(snapshot) → RefEdge[]
│       │   │   ├── coords.ts                    ← screen↔canvas conversion
│       │   │   ├── useDrag.ts                   ← per-node drag hook
│       │   │   └── usePanZoom.ts                ← canvas-level pan/zoom hook
│       │   ├── components/
│       │   │   ├── CanvasPane.tsx               ← NEW (replaces SnapshotPane in layout)
│       │   │   ├── FrameNode.tsx                ← NEW
│       │   │   ├── HeapNode.tsx                 ← NEW
│       │   │   ├── EdgesLayer.tsx               ← NEW
│       │   │   ├── CanvasLegend.tsx             ← NEW
│       │   │   ├── EditorPane.tsx               ← MODIFY (React.lazy code-split target)
│       │   │   ├── EditorPaneLazy.tsx           ← NEW (lazy wrapper)
│       │   │   └── SnapshotPane.tsx             ← unchanged but no longer imported
│       │   └── types.ts                         ← MODIFY (add Pos, RefEdge, NodeKind)
│       └── tests/
│           ├── canvas/
│           │   ├── layout.test.ts               ← NEW
│           │   └── refs.test.ts                 ← NEW
│           ├── atoms/
│           │   ├── session.test.ts              ← MODIFY (standardise scaffold + nodePositions tests)
│           │   └── canvas.test.ts               ← NEW (transient atoms)
│           └── e2e/
│               └── smoke.spec.ts                ← MODIFY (canvas svg + drag + position persistence)
```

---

## Conventions used throughout this plan

- TDD where unit tests apply (pure functions, atom logic). UI components ship with build + e2e smoke; no per-component unit tests.
- Reatom v1000 quirks already documented; key ones for this plan:
  - `clearStack()` is active in `main.tsx`. Atom reads/writes from non-React callbacks (DOM events, `setInterval`, RAF, mouse listeners on `window`) MUST be wrapped in `frame.run(...)` via `useFrame()`.
  - `withLocalStorage` reads `globalThis.localStorage` once at module load. Tests stub before any Reatom import.
- Vitest commands always use `--run`. Playwright uses `--reporter=line`.
- All paths absolute or repo-relative to `/home/codelance/projects/js-runtime-visualizer`.
- Conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `perf:`).
- Single-file `types.ts` convention from plan 1 still applies — UI component types come from `packages/ui/src/types.ts`.

---

## Task 1: UI types — add `Pos`, `RefEdge`, `NodeKind`

**Files:**
- Modify: `packages/ui/src/types.ts`

- [ ] **Step 1: Append type definitions**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/types.ts` first. Then append these definitions to the end of the file (do not remove existing content):

```ts

// =============================================================================
// Canvas types (plan 3)
// =============================================================================

export type Pos = { x: number; y: number };

export type NodeKind = 'frame' | 'heap';

// A reference edge to render: from a binding inside a frame, or from an own
// property of a heap object, to a heap object id.
export type RefEdge = {
  fromKind: NodeKind;
  fromId: string;     // frame index as string (e.g. "frame-0") or heap id (e.g. "obj7")
  fromLabel: string;  // the binding name or property key, used for tooltips
  toId: string;       // heap id
};

// Persistent storage of node positions. Frame ids use synthetic key "frame-{index}".
export type NodePositions = Map<string, Pos>;

// Pan/zoom transient state (not persisted — fresh per session).
export type PanZoom = { panX: number; panY: number; scale: number };

// Drag transient state — null when no node is being dragged.
export type DragState =
  | { active: false }
  | { active: true; id: string; pos: Pos };
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit -p packages/ui
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/types.ts
git commit -m "feat(ui): canvas types (Pos, RefEdge, NodeKind, NodePositions, PanZoom, DragState)"
```

---

## Task 2: Canvas atoms — persisted positions/collapsed + transient pan/zoom/drag

Plan-2 carry-over #1 lands here: a fourth persisted atom slot, `jsrv:nodePositions`. Versioned via the existing `STORAGE_VERSION = 1` constant (no version bump — existing slots stay valid; the new slot just appears alongside them).

`collapsedIds` is also persisted so collapsed state survives reload. `panZoom` and `dragState` are transient.

**Files:**
- Modify: `packages/ui/src/atoms/session.ts` — add persisted `nodePositionsAtom`, `collapsedIdsAtom`
- Create: `packages/ui/src/atoms/canvas.ts` — transient `panZoomAtom`, `dragStateAtom`
- Create: `packages/ui/tests/atoms/canvas.test.ts`

- [ ] **Step 1: Write failing test for canvas atoms**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/atoms/canvas.test.ts`:

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

describe('canvas atoms — transient pan/zoom + drag', () => {
  it('panZoomAtom default is { panX: 0, panY: 0, scale: 1 } and is NOT persisted', async () => {
    const { panZoomAtom } = await import('../../src/atoms/canvas');
    expect(panZoomAtom()).toEqual({ panX: 0, panY: 0, scale: 1 });
    panZoomAtom.set({ panX: 100, panY: 50, scale: 2 });
    expect(panZoomAtom()).toEqual({ panX: 100, panY: 50, scale: 2 });
    // Confirm no localStorage key for pan/zoom exists.
    expect(fakeStorage.getItem('jsrv:panZoom')).toBeNull();
  });

  it('dragStateAtom default is { active: false }', async () => {
    const { dragStateAtom } = await import('../../src/atoms/canvas');
    expect(dragStateAtom()).toEqual({ active: false });
    dragStateAtom.set({ active: true, id: 'obj1', pos: { x: 10, y: 20 } });
    expect(dragStateAtom()).toEqual({ active: true, id: 'obj1', pos: { x: 10, y: 20 } });
  });
});

describe('persisted canvas atoms', () => {
  it('nodePositionsAtom round-trips a Map via localStorage', async () => {
    const { nodePositionsAtom } = await import('../../src/atoms/session');
    const positions = new Map([['frame-0', { x: 50, y: 50 }], ['obj1', { x: 200, y: 50 }]]);
    nodePositionsAtom.set(positions);
    expect(nodePositionsAtom().get('frame-0')).toEqual({ x: 50, y: 50 });
    // localStorage was written.
    expect(fakeStorage.getItem('jsrv:nodePositions')).toBeTruthy();
  });

  it('collapsedIdsAtom round-trips a Set via localStorage', async () => {
    const { collapsedIdsAtom } = await import('../../src/atoms/session');
    const collapsed = new Set(['obj1', 'obj3']);
    collapsedIdsAtom.set(collapsed);
    expect(collapsedIdsAtom().has('obj1')).toBe(true);
    expect(collapsedIdsAtom().has('obj3')).toBe(true);
    expect(fakeStorage.getItem('jsrv:collapsedIds')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npx vitest --run packages/ui/tests/atoms/canvas.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Extend `session.ts` with persisted canvas atoms**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/session.ts` first. Then APPEND these atoms after the existing three. The `withLocalStorage` adapter handles `Map` and `Set` via the optional `toSnapshot` / `fromSnapshot` callbacks since JSON.stringify on Map/Set yields `{}`. Use plain object/array conversion.

Add the imports at the top (alongside the existing `atom, withLocalStorage`):

```ts
import type { NodePositions, Pos } from '../types';
```

Add at the bottom of the file:

```ts
// Node positions on the canvas. Keyed by frame-{index} for stack frames or
// heap object id (e.g. "obj7"). Persisted so reload restores the last layout.
export const nodePositionsAtom = atom<NodePositions>(new Map(), 'nodePositionsAtom').extend(
  withLocalStorage<NodePositions>({
    key: persistKey('nodePositions'),
    version: STORAGE_VERSION,
    toSnapshot: (m: NodePositions): Array<[string, Pos]> => Array.from(m.entries()),
    fromSnapshot: (entries: unknown): NodePositions => {
      if (!Array.isArray(entries)) return new Map();
      return new Map(entries as Array<[string, Pos]>);
    },
  }),
);

// Collapsed nodes on the canvas. Same key shape as nodePositionsAtom.
export const collapsedIdsAtom = atom<Set<string>>(new Set(), 'collapsedIdsAtom').extend(
  withLocalStorage<Set<string>>({
    key: persistKey('collapsedIds'),
    version: STORAGE_VERSION,
    toSnapshot: (s: Set<string>): string[] => Array.from(s),
    fromSnapshot: (arr: unknown): Set<string> => {
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr as string[]);
    },
  }),
);
```

If the installed `@reatom/core@1000.15.2` declares `withLocalStorage`'s options without `toSnapshot`/`fromSnapshot`, fall back to manual encoding via two value atoms (a serialised string atom + a derived computed). Inspect:

```bash
grep -A 50 "WithPersistOptions" node_modules/@reatom/core/build/persist/*.d.ts | head -80
```

The Context7 docs confirm `toSnapshot` / `fromSnapshot` are part of the v1000 API. If they aren't declared in the installed `.d.ts`, report DONE_WITH_CONCERNS and use the fallback (string atom + derived parse).

- [ ] **Step 4: Create `canvas.ts` for transient atoms**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/canvas.ts`:

```ts
import { atom } from '@reatom/core';
import type { DragState, PanZoom } from '../types';

// Transient — pan/zoom is fresh per session.
export const panZoomAtom = atom<PanZoom>(
  { panX: 0, panY: 0, scale: 1 },
  'panZoomAtom',
);

// Transient — only set during a mouse drag.
export const dragStateAtom = atom<DragState>(
  { active: false },
  'dragStateAtom',
);
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npx vitest --run packages/ui/tests/atoms/canvas.test.ts
```

Expected: 4 tests pass.

```bash
npx vitest --run
```

Expected: 76 tests pass total (72 baseline + 4 new).

- [ ] **Step 6: TypeScript + lint**

```bash
npx tsc --noEmit -p packages/ui
./node_modules/.bin/eslint packages --ext .ts,.tsx
```

Expected: both silent.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/atoms packages/ui/tests/atoms/canvas.test.ts
git commit -m "feat(ui): canvas atoms — persisted positions/collapsed + transient pan/zoom/drag"
```

---

## Task 3: Layout helper — default node positions

A pure function that takes a snapshot and existing positions, and returns positions for every node in the snapshot. Frames stack vertically on the left; heap objects fill a grid on the right. Existing positions are preserved.

**Files:**
- Create: `packages/ui/src/canvas/layout.ts`
- Create: `packages/ui/tests/canvas/layout.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/canvas/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultLayout, frameKey, FRAME_X, HEAP_X_START } from '../../src/canvas/layout';
import type { Snapshot } from '../../src/types';

function buildSnapshot(frames: number, heapIds: string[]): Snapshot {
  const callStack = Array.from({ length: frames }, (_, i) => ({
    fnName: i === 0 ? '<global>' : `fn${i}`,
    callSite: null,
    bindings: new Map(),
  }));
  const heap = new Map(
    heapIds.map((id) => [
      id,
      {
        kind: 'object' as const,
        ownProps: new Map(),
        prototype: null,
      },
    ]),
  );
  return {
    step: 0,
    loc: { line: 1, col: 0 },
    eventKind: 'enter-frame',
    callStack,
    heap,
    consoleOut: [],
    highlights: {},
  };
}

describe('defaultLayout', () => {
  it('places frames vertically at FRAME_X with a stable key', () => {
    const snap = buildSnapshot(2, []);
    const positions = defaultLayout(snap, new Map());
    expect(positions.get(frameKey(0))).toEqual({ x: FRAME_X, y: 30 });
    expect(positions.get(frameKey(1))?.x).toBe(FRAME_X);
    expect(positions.get(frameKey(1))!.y).toBeGreaterThan(positions.get(frameKey(0))!.y);
  });

  it('places heap nodes in a right-side grid starting at HEAP_X_START', () => {
    const snap = buildSnapshot(0, ['obj1', 'obj2', 'obj3']);
    const positions = defaultLayout(snap, new Map());
    expect(positions.get('obj1')?.x).toBe(HEAP_X_START);
    expect(positions.get('obj2')?.x).toBe(HEAP_X_START);
    expect(positions.get('obj2')!.y).toBeGreaterThan(positions.get('obj1')!.y);
  });

  it('preserves existing positions for ids already laid out', () => {
    const snap = buildSnapshot(1, ['obj1']);
    const existing = new Map([
      [frameKey(0), { x: 999, y: 999 }],
      ['obj1', { x: 500, y: 500 }],
    ]);
    const positions = defaultLayout(snap, existing);
    expect(positions.get(frameKey(0))).toEqual({ x: 999, y: 999 });
    expect(positions.get('obj1')).toEqual({ x: 500, y: 500 });
  });

  it('lays out new ids using defaults even if some existing positions are present', () => {
    const snap = buildSnapshot(1, ['obj1', 'obj2']);
    const existing = new Map([['obj1', { x: 500, y: 500 }]]);
    const positions = defaultLayout(snap, existing);
    expect(positions.get('obj1')).toEqual({ x: 500, y: 500 });
    expect(positions.get('obj2')?.x).toBe(HEAP_X_START);
  });
});
```

- [ ] **Step 2: Implement `layout.ts`**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/layout.ts`:

```ts
import type { NodePositions, Pos, Snapshot } from '../types';

// Layout grid constants — exported for tests and for reuse in the canvas
// pane when computing the total content extent.
export const FRAME_X = 30;          // frames column (canvas-space x)
export const FRAME_Y_START = 30;    // first frame y
export const FRAME_HEIGHT = 130;    // approximate height per frame card
export const HEAP_X_START = 320;    // heap grid starts here
export const HEAP_Y_START = 30;
export const HEAP_HEIGHT = 130;

// Synthetic id for stack frames. Heap objects use their real "obj{n}" id.
export const frameKey = (index: number): string => `frame-${index}`;

// Given a snapshot and previously known positions (from atoms / drag history),
// return positions for every node in the snapshot. Existing positions are
// preserved; new nodes get default positions. Pure function, no side effects.
export function defaultLayout(snap: Snapshot, existing: NodePositions): NodePositions {
  const out: NodePositions = new Map(existing);
  // Stack frames: vertical column at FRAME_X. Index 0 is the bottom of the stack
  // (global). Higher indices are further up.
  snap.callStack.forEach((_frame, i) => {
    const key = frameKey(i);
    if (!out.has(key)) {
      out.set(key, { x: FRAME_X, y: FRAME_Y_START + i * FRAME_HEIGHT });
    }
  });
  // Heap: simple vertical strip at HEAP_X_START, ordered by id appearance.
  let heapIndex = 0;
  for (const [id] of snap.heap) {
    if (!out.has(id)) {
      out.set(id, { x: HEAP_X_START, y: HEAP_Y_START + heapIndex * HEAP_HEIGHT });
    }
    heapIndex++;
  }
  return out;
}

// Convenience: compute the layout extent so the canvas viewport can size itself
// (used for "auto-arrange" reset and for initial pan bounds).
export function layoutExtent(positions: NodePositions): Pos {
  let maxX = 600;
  let maxY = 400;
  for (const { x, y } of positions.values()) {
    if (x + 200 > maxX) maxX = x + 200;
    if (y + 140 > maxY) maxY = y + 140;
  }
  return { x: maxX, y: maxY };
}
```

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest --run packages/ui/tests/canvas/layout.test.ts
```

Expected: 4 tests pass.

```bash
npx vitest --run
```

Expected: 80 tests pass total.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit -p packages/ui
```

Expected: silent.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/canvas/layout.ts packages/ui/tests/canvas/layout.test.ts
git commit -m "feat(ui): canvas defaultLayout helper + grid constants"
```

---

## Task 4: Reference-edge extraction

Pure function that walks a snapshot and returns the list of `RefEdge`s — variable bindings in frames pointing to heap ids, and own-properties of heap objects pointing to other heap ids. The edge layer renders these.

Prototype edges and closure edges are deliberately NOT extracted here — they land in plan 4.

**Files:**
- Create: `packages/ui/src/canvas/refs.ts`
- Create: `packages/ui/tests/canvas/refs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/canvas/refs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractRefEdges } from '../../src/canvas/refs';
import { frameKey } from '../../src/canvas/layout';
import type { Snapshot } from '../../src/types';

function snapWith(opts: {
  frameBindings?: Array<Map<string, { kind: string; id?: string; value?: unknown }>>;
  heap?: Array<[string, Map<string, { kind: string; id?: string; value?: unknown }>]>;
}): Snapshot {
  const callStack = (opts.frameBindings ?? []).map((bindings, i) => ({
    fnName: i === 0 ? '<global>' : `fn${i}`,
    callSite: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bindings: bindings as any,
  }));
  const heap = new Map(
    (opts.heap ?? []).map(([id, ownProps]) => [
      id,
      {
        kind: 'object' as const,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ownProps: ownProps as any,
        prototype: null,
      },
    ]),
  );
  return {
    step: 0,
    loc: { line: 1, col: 0 },
    eventKind: 'enter-frame',
    callStack,
    heap,
    consoleOut: [],
    highlights: {},
  };
}

describe('extractRefEdges', () => {
  it('emits an edge for each Reference in a frame binding', () => {
    const snap = snapWith({
      frameBindings: [
        new Map([
          ['x', { kind: 'number', value: 1 }],
          ['obj', { kind: 'ref', id: 'obj7' }],
        ]),
      ],
    });
    const edges = extractRefEdges(snap);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      fromKind: 'frame',
      fromId: frameKey(0),
      fromLabel: 'obj',
      toId: 'obj7',
    });
  });

  it('emits an edge for each Reference in a heap object ownProp', () => {
    const snap = snapWith({
      heap: [
        ['obj1', new Map([['child', { kind: 'ref', id: 'obj2' }]])],
        ['obj2', new Map()],
      ],
    });
    const edges = extractRefEdges(snap);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      fromKind: 'heap',
      fromId: 'obj1',
      fromLabel: 'child',
      toId: 'obj2',
    });
  });

  it('skips primitives and emits nothing for binding-less frames', () => {
    const snap = snapWith({
      frameBindings: [new Map([['x', { kind: 'number', value: 1 }]])],
    });
    expect(extractRefEdges(snap)).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement `refs.ts`**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/refs.ts`:

```ts
import type { JSValue, RefEdge, Snapshot } from '../types';
import { frameKey } from './layout';

function isRef(v: JSValue): v is { kind: 'ref'; id: string } {
  return v.kind === 'ref';
}

// Walks the snapshot and returns one RefEdge per (binding|ownProp) → heap-id link.
// Pure: same input → same output.
export function extractRefEdges(snap: Snapshot): RefEdge[] {
  const out: RefEdge[] = [];
  snap.callStack.forEach((frame, i) => {
    for (const [name, value] of frame.bindings) {
      if (isRef(value)) {
        out.push({
          fromKind: 'frame',
          fromId: frameKey(i),
          fromLabel: name,
          toId: value.id,
        });
      }
    }
  });
  for (const [id, obj] of snap.heap) {
    for (const [key, value] of obj.ownProps) {
      if (isRef(value)) {
        out.push({
          fromKind: 'heap',
          fromId: id,
          fromLabel: key,
          toId: value.id,
        });
      }
    }
  }
  return out;
}
```

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest --run packages/ui/tests/canvas/refs.test.ts
```

Expected: 3 tests pass.

```bash
npx vitest --run
```

Expected: 83 tests total.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/canvas/refs.ts packages/ui/tests/canvas/refs.test.ts
git commit -m "feat(ui): extractRefEdges — variable + ownProp reference edges"
```

---

## Task 5: Coords helper — screen ↔ canvas conversion

Mouse events come in screen coordinates. Drag and pan logic needs canvas coordinates (pre-transform). One small pure helper.

**Files:**
- Create: `packages/ui/src/canvas/coords.ts`

- [ ] **Step 1: Implement `coords.ts`**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/coords.ts`:

```ts
import type { PanZoom, Pos } from '../types';

// Convert a screen-space mouse delta (dx, dy) to canvas-space delta by
// dividing by the current zoom. Used during a node drag so that 1 pixel of
// mouse movement equals 1 canvas unit at zoom=1, but slower at zoom>1.
export function screenDeltaToCanvas(dx: number, dy: number, pz: PanZoom): Pos {
  return { x: dx / pz.scale, y: dy / pz.scale };
}

// Convert a screen position (e.g. clientX/clientY relative to the SVG element)
// into canvas-space coordinates by undoing pan + zoom.
export function screenToCanvas(screen: Pos, pz: PanZoom): Pos {
  return {
    x: (screen.x - pz.panX) / pz.scale,
    y: (screen.y - pz.panY) / pz.scale,
  };
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit -p packages/ui
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/canvas/coords.ts
git commit -m "feat(ui): coords helpers (screenDeltaToCanvas, screenToCanvas)"
```

---

## Task 6: Drag hook — `useDrag(id)`

A React hook that wires `mousedown` on a node to a `mousemove` + `mouseup` on `window`. During the drag it updates `dragStateAtom` (transient — no localStorage write per tick). On `mouseup` it commits the final position to `nodePositionsAtom` (one localStorage write per drag).

Crucial detail: `mousemove`/`mouseup` listeners run outside any Reatom frame, so all atom interaction MUST be wrapped in `frame.run(...)` via `useFrame()`. This is the same pattern that fixed the editor and scrubber bugs in plan-2 follow-ups.

**Files:**
- Create: `packages/ui/src/canvas/useDrag.ts`

- [ ] **Step 1: Implement `useDrag.ts`**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/useDrag.ts`:

```ts
import { useCallback } from 'react';
import { useAtom, useFrame } from '@reatom/react';
import { panZoomAtom, dragStateAtom } from '../atoms/canvas';
import { nodePositionsAtom } from '../atoms/session';
import type { Pos } from '../types';
import { screenDeltaToCanvas } from './coords';

// Returns an onMouseDown handler that initiates a node drag. The handler
// captures starting mouse + position, then attaches window-level listeners
// for move and up. During move, dragStateAtom is updated. On up, the final
// position is written to nodePositionsAtom.
export function useDrag(id: string, currentPos: Pos): {
  onMouseDown: (e: React.MouseEvent) => void;
} {
  const [pz] = useAtom(panZoomAtom);
  const frame = useFrame();

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't let a node drag also pan the canvas.
      e.stopPropagation();
      e.preventDefault();
      const startMouse = { x: e.clientX, y: e.clientY };
      const startPos = currentPos;

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouse.x;
        const dy = ev.clientY - startMouse.y;
        const delta = screenDeltaToCanvas(dx, dy, pz);
        const next: Pos = { x: startPos.x + delta.x, y: startPos.y + delta.y };
        frame.run(() => dragStateAtom.set({ active: true, id, pos: next }));
      };

      const onUp = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouse.x;
        const dy = ev.clientY - startMouse.y;
        const delta = screenDeltaToCanvas(dx, dy, pz);
        const finalPos: Pos = { x: startPos.x + delta.x, y: startPos.y + delta.y };
        frame.run(() => {
          // Commit to persisted atom.
          const map = new Map(nodePositionsAtom());
          map.set(id, finalPos);
          nodePositionsAtom.set(map);
          // Clear transient drag state.
          dragStateAtom.set({ active: false });
        });
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [id, currentPos, pz, frame],
  );

  return { onMouseDown };
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit -p packages/ui
```

Expected: silent. The implicit `React.MouseEvent` type comes from the global JSX namespace because the project enables `@types/react`.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/canvas/useDrag.ts
git commit -m "feat(ui): useDrag hook — transient drag state, commit on mouseup"
```

---

## Task 7: PanZoom hook — `usePanZoom`

Returns `mousedown` + `wheel` handlers for the canvas SVG element. Mouse-down on EMPTY canvas (the SVG itself, not a node) starts a pan; nodes call `e.stopPropagation()` so their drag wins. Wheel adjusts `scale` between fixed bounds, anchored at the cursor.

Like `useDrag`, all atom updates run inside `frame.run(...)`.

**Files:**
- Create: `packages/ui/src/canvas/usePanZoom.ts`

- [ ] **Step 1: Implement `usePanZoom.ts`**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/canvas/usePanZoom.ts`:

```ts
import { useCallback } from 'react';
import { useAtom, useFrame } from '@reatom/react';
import { panZoomAtom } from '../atoms/canvas';

const SCALE_MIN = 0.25;
const SCALE_MAX = 3;

export function usePanZoom() {
  const [pz] = useAtom(panZoomAtom);
  const frame = useFrame();

  const onMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Only start a pan when the mousedown target is the SVG itself —
      // node drags stopPropagation in their own onMouseDown.
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      const startMouse = { x: e.clientX, y: e.clientY };
      const startPan = { panX: pz.panX, panY: pz.panY };

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouse.x;
        const dy = ev.clientY - startMouse.y;
        frame.run(() =>
          panZoomAtom.set((prev) => ({
            ...prev,
            panX: startPan.panX + dx,
            panY: startPan.panY + dy,
          })),
        );
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [pz.panX, pz.panY, frame],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      frame.run(() =>
        panZoomAtom.set((prev) => {
          const nextScale = Math.min(
            SCALE_MAX,
            Math.max(SCALE_MIN, prev.scale * (1 + delta)),
          );
          // Anchor the zoom at the cursor: keep the canvas-space point under
          // the mouse stationary by adjusting pan.
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const ratio = nextScale / prev.scale;
          return {
            scale: nextScale,
            panX: mx - (mx - prev.panX) * ratio,
            panY: my - (my - prev.panY) * ratio,
          };
        }),
      );
    },
    [frame],
  );

  return { onMouseDown, onWheel };
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit -p packages/ui
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/canvas/usePanZoom.ts
git commit -m "feat(ui): usePanZoom hook — drag-to-pan + cursor-anchored wheel zoom"
```

---

## Task 8: FrameNode component

A draggable, collapsible SVG group rendering a stack frame. Reads its position from the drag state (if it's the active drag target) or from `nodePositionsAtom`, falling back to default layout. Click on the title bar toggles collapse via `collapsedIdsAtom`.

**Files:**
- Create: `packages/ui/src/components/FrameNode.tsx`

- [ ] **Step 1: Implement FrameNode**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/FrameNode.tsx`:

```tsx
import { useAtom, useFrame } from '@reatom/react';
import { collapsedIdsAtom } from '../atoms/session';
import { dragStateAtom } from '../atoms/canvas';
import { useDrag } from '../canvas/useDrag';
import { frameKey } from '../canvas/layout';
import type { FrameSnapshot, JSValue, Pos } from '../types';

const FRAME_W = 260;

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

export function FrameNode(props: {
  index: number;
  frame: FrameSnapshot;
  isTop: boolean;
  pos: Pos;
}) {
  const { index, frame, isTop, pos } = props;
  const id = frameKey(index);
  const [collapsed] = useAtom(collapsedIdsAtom);
  const [drag] = useAtom(dragStateAtom);
  const reatomFrame = useFrame();

  // Live position during drag.
  const renderPos = drag.active && drag.id === id ? drag.pos : pos;
  const isCollapsed = collapsed.has(id);
  const drager = useDrag(id, renderPos);

  const onTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    reatomFrame.run(() => {
      const next = new Set(collapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      collapsedIdsAtom.set(next);
    });
  };

  const titleColor = isTop ? 'var(--accent)' : 'var(--info)';
  const borderColor = isTop ? 'var(--accent)' : 'var(--border)';
  const headerHeight = 22;
  const lineHeight = 16;
  const padding = 6;
  const bindings = isCollapsed ? [] : Array.from(frame.bindings.entries());
  const height = headerHeight + (isCollapsed ? 0 : padding + bindings.length * lineHeight + padding);

  return (
    <g transform={`translate(${renderPos.x}, ${renderPos.y})`}>
      <rect
        width={FRAME_W}
        height={height}
        rx={6}
        fill="var(--panel)"
        stroke={borderColor}
        strokeWidth={isTop ? 2 : 1}
      />
      {/* Header bar — drag handle + collapse toggle. */}
      <rect
        width={FRAME_W}
        height={headerHeight}
        rx={6}
        fill="rgba(0,0,0,0.2)"
        onMouseDown={drager.onMouseDown}
        style={{ cursor: 'move' }}
      />
      <text
        x={8}
        y={15}
        fontSize={11}
        fontFamily="JetBrains Mono, monospace"
        fill={titleColor}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {isTop ? '▶ ' : ''}
        {frame.fnName}
      </text>
      <text
        x={FRAME_W - 8}
        y={15}
        fontSize={9}
        fontFamily="JetBrains Mono, monospace"
        textAnchor="end"
        fill="var(--muted)"
        onClick={onTitleClick}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {isCollapsed ? '▸' : '▾'}
      </text>
      {/* Bindings */}
      {!isCollapsed &&
        bindings.map(([k, v], i) => (
          <text
            key={k}
            x={10}
            y={headerHeight + padding + (i + 1) * lineHeight - 4}
            fontSize={11}
            fontFamily="JetBrains Mono, monospace"
            fill="var(--text)"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <tspan fill="var(--good)">{k}</tspan>: {renderValue(v)}
          </text>
        ))}
      {!isCollapsed && bindings.length === 0 && (
        <text
          x={10}
          y={headerHeight + padding + lineHeight - 4}
          fontSize={10}
          fontFamily="JetBrains Mono, monospace"
          fill="var(--muted)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          (no bindings)
        </text>
      )}
    </g>
  );
}
```

- [ ] **Step 2: Build to confirm**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean. (No imports from this file yet — it'll be wired in Task 11.)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/FrameNode.tsx
git commit -m "feat(ui): FrameNode component — draggable, collapsible SVG frame"
```

---

## Task 9: HeapNode component

Draggable, collapsible SVG group rendering a heap object. Same patterns as FrameNode but with kind-coded label colour and own-props instead of bindings.

**Files:**
- Create: `packages/ui/src/components/HeapNode.tsx`

- [ ] **Step 1: Implement HeapNode**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/HeapNode.tsx`:

```tsx
import { useAtom, useFrame } from '@reatom/react';
import { collapsedIdsAtom } from '../atoms/session';
import { dragStateAtom } from '../atoms/canvas';
import { useDrag } from '../canvas/useDrag';
import type { HeapObject, JSValue, Pos } from '../types';

const NODE_W = 240;

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

export function HeapNode(props: { id: string; obj: HeapObject; pos: Pos }) {
  const { id, obj, pos } = props;
  const [collapsed] = useAtom(collapsedIdsAtom);
  const [drag] = useAtom(dragStateAtom);
  const reatomFrame = useFrame();

  const renderPos = drag.active && drag.id === id ? drag.pos : pos;
  const isCollapsed = collapsed.has(id);
  const drager = useDrag(id, renderPos);

  const onToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    reatomFrame.run(() => {
      const next = new Set(collapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      collapsedIdsAtom.set(next);
    });
  };

  const labelColor =
    obj.kind === 'function' ? 'var(--info)' :
    obj.kind === 'array' ? 'var(--accent)' :
    'var(--good)';

  const headerHeight = 22;
  const lineHeight = 16;
  const padding = 6;
  const props_ = isCollapsed ? [] : Array.from(obj.ownProps.entries());
  const height = headerHeight + (isCollapsed ? 0 : padding + Math.max(1, props_.length) * lineHeight + padding);

  return (
    <g transform={`translate(${renderPos.x}, ${renderPos.y})`}>
      <rect
        width={NODE_W}
        height={height}
        rx={6}
        fill="var(--panel)"
        stroke="var(--border)"
        strokeWidth={1}
      />
      <rect
        width={NODE_W}
        height={headerHeight}
        rx={6}
        fill="rgba(0,0,0,0.2)"
        onMouseDown={drager.onMouseDown}
        style={{ cursor: 'move' }}
      />
      <text
        x={8}
        y={15}
        fontSize={11}
        fontFamily="JetBrains Mono, monospace"
        fill={labelColor}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {obj.kind} #{id}
        {obj.source?.name ? `  ƒ ${obj.source.name}` : ''}
      </text>
      <text
        x={NODE_W - 8}
        y={15}
        fontSize={9}
        textAnchor="end"
        fill="var(--muted)"
        onClick={onToggle}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {isCollapsed ? '▸' : '▾'}
      </text>
      {!isCollapsed &&
        props_.map(([k, v], i) => (
          <text
            key={k}
            x={10}
            y={headerHeight + padding + (i + 1) * lineHeight - 4}
            fontSize={11}
            fontFamily="JetBrains Mono, monospace"
            fill="var(--text)"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <tspan fill="var(--good)">{k}</tspan>: {renderValue(v)}
          </text>
        ))}
      {!isCollapsed && props_.length === 0 && (
        <text
          x={10}
          y={headerHeight + padding + lineHeight - 4}
          fontSize={10}
          fontFamily="JetBrains Mono, monospace"
          fill="var(--muted)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          (no own props)
        </text>
      )}
    </g>
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
git add packages/ui/src/components/HeapNode.tsx
git commit -m "feat(ui): HeapNode component — draggable, collapsible SVG heap object"
```

---

## Task 10: EdgesLayer component

Renders SVG `<line>` (or `<path>`) elements for every reference edge. Each edge connects the right edge of the source node to the left edge of the target node. Source/target positions read from the same `nodePositionsAtom` (or live drag pos).

**Files:**
- Create: `packages/ui/src/components/EdgesLayer.tsx`

- [ ] **Step 1: Implement EdgesLayer**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/EdgesLayer.tsx`:

```tsx
import { useAtom } from '@reatom/react';
import { dragStateAtom } from '../atoms/canvas';
import { nodePositionsAtom } from '../atoms/session';
import type { NodePositions, Pos, RefEdge } from '../types';

const FRAME_W = 260;
const HEAP_W = 240;
const NODE_HEADER_H = 22;

function nodeWidth(kind: 'frame' | 'heap'): number {
  return kind === 'frame' ? FRAME_W : HEAP_W;
}

function rightAnchor(kind: 'frame' | 'heap', pos: Pos): Pos {
  return { x: pos.x + nodeWidth(kind), y: pos.y + NODE_HEADER_H + 6 };
}

function leftAnchor(pos: Pos): Pos {
  // Targets are always heap nodes for ref edges; left anchor is at x.
  return { x: pos.x, y: pos.y + NODE_HEADER_H + 6 };
}

function getPos(
  id: string,
  positions: NodePositions,
  drag: { active: boolean; id?: string; pos?: Pos },
): Pos | null {
  if (drag.active && drag.id === id && drag.pos) return drag.pos;
  return positions.get(id) ?? null;
}

export function EdgesLayer(props: { edges: RefEdge[] }) {
  const [positions] = useAtom(nodePositionsAtom);
  const [drag] = useAtom(dragStateAtom);
  return (
    <g>
      {props.edges.map((e, i) => {
        const fromPos = getPos(e.fromId, positions, drag);
        const toPos = getPos(e.toId, positions, drag);
        if (!fromPos || !toPos) return null;
        const start = rightAnchor(e.fromKind, fromPos);
        const end = leftAnchor(toPos);
        // Curved bezier-ish path: simple cubic with horizontal control points.
        const dx = Math.max(40, (end.x - start.x) / 2);
        const c1 = { x: start.x + dx, y: start.y };
        const c2 = { x: end.x - dx, y: end.y };
        const d = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
        return (
          <path
            key={`${e.fromId}-${e.fromLabel}-${e.toId}-${i}`}
            d={d}
            fill="none"
            stroke="var(--info)"
            strokeWidth={1.5}
            opacity={0.85}
            markerEnd="url(#arrowhead)"
          >
            <title>{`${e.fromLabel} → ${e.toId}`}</title>
          </path>
        );
      })}
    </g>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/EdgesLayer.tsx
git commit -m "feat(ui): EdgesLayer — bezier paths between source and target nodes"
```

---

## Task 11: CanvasPane composition

Composes the SVG, the pan-zoom transform group, the edges layer, and per-frame / per-heap-id node components. Computes positions on the fly via `defaultLayout` and sources edges via `extractRefEdges`.

**Files:**
- Create: `packages/ui/src/components/CanvasPane.tsx`

- [ ] **Step 1: Implement CanvasPane**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/CanvasPane.tsx`:

```tsx
import { useMemo } from 'react';
import { useAtom } from '@reatom/react';
import { currentSnapshotAtom, totalStepsAtom } from '../atoms/derived';
import { currentStepIndexAtom } from '../atoms/ui';
import { nodePositionsAtom } from '../atoms/session';
import { panZoomAtom } from '../atoms/canvas';
import { defaultLayout, frameKey } from '../canvas/layout';
import { extractRefEdges } from '../canvas/refs';
import { usePanZoom } from '../canvas/usePanZoom';
import { FrameNode } from './FrameNode';
import { HeapNode } from './HeapNode';
import { EdgesLayer } from './EdgesLayer';
import type { EventKind } from '../types';

const EVENT_LABELS: Record<EventKind, string> = {
  'enter-frame': 'Function entered',
  'leave-frame': 'Function returned',
  assign: 'Variable assigned',
  allocate: 'Object allocated',
  lookup: 'Variable read',
  mutate: 'Property updated',
  console: 'console.log',
};

export function CanvasPane() {
  const [snap] = useAtom(currentSnapshotAtom);
  const [step] = useAtom(currentStepIndexAtom);
  const [total] = useAtom(totalStepsAtom);
  const [positions] = useAtom(nodePositionsAtom);
  const [pz] = useAtom(panZoomAtom);
  const { onMouseDown, onWheel } = usePanZoom();

  const laidOut = useMemo(
    () => (snap ? defaultLayout(snap, positions) : positions),
    [snap, positions],
  );
  const edges = useMemo(() => (snap ? extractRefEdges(snap) : []), [snap]);

  return (
    <div className="snapshot" style={{ padding: 0, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          right: 12,
          display: 'flex',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        <strong>Snapshot</strong>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          {snap
            ? `step ${step + 1} / ${total} · ${EVENT_LABELS[snap.eventKind] ?? snap.eventKind} @ L${snap.loc.line}`
            : '(no run)'}
        </span>
      </div>
      <svg
        width="100%"
        height="100%"
        style={{ display: 'block', cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--info)" />
          </marker>
        </defs>
        <g transform={`translate(${pz.panX}, ${pz.panY}) scale(${pz.scale})`}>
          {snap && (
            <>
              <EdgesLayer edges={edges} />
              {snap.callStack.map((frame, i) => {
                const pos = laidOut.get(frameKey(i));
                if (!pos) return null;
                return (
                  <FrameNode
                    key={`frame-${i}`}
                    index={i}
                    frame={frame}
                    isTop={i === snap.callStack.length - 1}
                    pos={pos}
                  />
                );
              })}
              {Array.from(snap.heap.entries()).map(([id, obj]) => {
                const pos = laidOut.get(id);
                if (!pos) return null;
                return <HeapNode key={id} id={id} obj={obj} pos={pos} />;
              })}
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/CanvasPane.tsx
git commit -m "feat(ui): CanvasPane — SVG with pan/zoom + frames + heap + edges"
```

---

## Task 12: Replace SnapshotPane with CanvasPane in App

**Files:**
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Edit App.tsx**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/App.tsx`. Replace the `SnapshotPane` import with `CanvasPane`, and the `<SnapshotPane />` usage:

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

(`SnapshotPane.tsx`, `CallStackView.tsx`, `HeapView.tsx` files remain in `components/` for reference but are no longer imported.)

- [ ] **Step 2: Build + run e2e to confirm baseline still works**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
npm run e2e
```

Expected: build clean. The existing e2e smoke MAY fail because it asserts on the OLD textual snapshot pane content (`x: 5`, `<global>`). That's expected; Task 16 updates the smoke. For now, just confirm it's the SnapshotPane assertions that fail and not any lower-level error.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/App.tsx
git commit -m "feat(ui): wire CanvasPane in App in place of SnapshotPane"
```

---

## Task 13: Auto-arrange button + reset on Run

Two small UX additions:

1. An "Auto-arrange" button in the Toolbar that clears `nodePositionsAtom` (causing `defaultLayout` to recompute everything from scratch).
2. When `runAction` runs, ALSO clear `panZoomAtom` so the user starts at origin/scale=1. (Positions intentionally persist across runs so the user's drag-arrangement survives.)

**Files:**
- Modify: `packages/ui/src/atoms/actions.ts`
- Modify: `packages/ui/src/components/Toolbar.tsx`

- [ ] **Step 1: Extend `actions.ts`**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/atoms/actions.ts`. Add the import at the top:

```ts
import { panZoomAtom } from './canvas';
```

Add `panZoomAtom.set({ panX: 0, panY: 0, scale: 1 });` to BOTH branches of `runAction` and to `resetAction`. Place after the `isPlayingAtom.set(false);` line in each. Also add a new `autoArrangeAction`:

```ts
export const autoArrangeAction = action(() => {
  // Clearing nodePositions makes defaultLayout recompute every node fresh.
  nodePositionsAtom.set(new Map());
  panZoomAtom.set({ panX: 0, panY: 0, scale: 1 });
}, 'autoArrangeAction');
```

Add the `nodePositionsAtom` import at the top:

```ts
import { codeAtom, drillInAtom, nodePositionsAtom } from './session';
```

(Replace whatever the existing import is — preserve all three names.)

- [ ] **Step 2: Add the button to the Toolbar**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/Toolbar.tsx`. Add the import for `autoArrangeAction` from `../atoms/actions`. Add `const onAutoArrange = useAction(autoArrangeAction);` alongside the others. Insert a new button between Reset and the error indicator:

```tsx
<button onClick={onAutoArrange} title="Reset all node positions and pan/zoom">
  Auto-arrange
</button>
```

- [ ] **Step 3: Build + lint + tests**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
npx vitest --run
./node_modules/.bin/eslint packages --ext .ts,.tsx
```

Expected: build clean, 83 tests still pass, lint silent.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/atoms/actions.ts packages/ui/src/components/Toolbar.tsx
git commit -m "feat(ui): Auto-arrange button + reset pan/zoom on Run/Reset"
```

---

## Task 14: Canvas legend (corner overlay)

Tiny absolute-positioned div in the canvas pane corner that explains the edge colour and hints at interactions.

**Files:**
- Create: `packages/ui/src/components/CanvasLegend.tsx`
- Modify: `packages/ui/src/components/CanvasPane.tsx` to render the legend

- [ ] **Step 1: Implement CanvasLegend**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/CanvasLegend.tsx`:

```tsx
export function CanvasLegend() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        right: 8,
        background: 'var(--panel-2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 8,
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        color: 'var(--muted)',
        pointerEvents: 'none',
        zIndex: 1,
        lineHeight: 1.6,
      }}
    >
      <div style={{ color: 'var(--text)', marginBottom: 4 }}>Legend</div>
      <div>
        <span style={{ color: 'var(--info)' }}>━━</span> reference (variable / property)
      </div>
      <div style={{ color: 'var(--muted)' }}>drag header · click ▾/▸ collapse · wheel zoom</div>
    </div>
  );
}
```

- [ ] **Step 2: Render the legend in CanvasPane**

Edit `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/CanvasPane.tsx`. Add the import:

```tsx
import { CanvasLegend } from './CanvasLegend';
```

Inside the outer `<div className="snapshot" ...>` and AFTER the closing `</svg>`, add:

```tsx
<CanvasLegend />
```

- [ ] **Step 3: Build**

```bash
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/CanvasLegend.tsx packages/ui/src/components/CanvasPane.tsx
git commit -m "feat(ui): CanvasLegend overlay"
```

---

## Task 15: Code-split CodeMirror via React.lazy

Plan-2 carry-over #4. The bundle currently emits an 808 kB chunk because CodeMirror is in the main bundle. Wrap `EditorPane` in `React.lazy` so CodeMirror loads in a separate chunk.

**Files:**
- Create: `packages/ui/src/components/EditorPaneLazy.tsx`
- Modify: `packages/ui/src/App.tsx` to use the lazy wrapper

- [ ] **Step 1: Implement EditorPaneLazy**

Create `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/components/EditorPaneLazy.tsx`:

```tsx
import { lazy, Suspense } from 'react';

const EditorPane = lazy(() =>
  import('./EditorPane').then((m) => ({ default: m.EditorPane })),
);

export function EditorPaneLazy() {
  return (
    <Suspense
      fallback={
        <div
          className="editor"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            fontSize: 12,
          }}
        >
          loading editor…
        </div>
      }
    >
      <EditorPane />
    </Suspense>
  );
}
```

- [ ] **Step 2: Use the lazy wrapper in App.tsx**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/src/App.tsx`. Replace the `EditorPane` import with `EditorPaneLazy`:

```tsx
import { EditorPaneLazy } from './components/EditorPaneLazy';
```

And the usage:

```tsx
<EditorPaneLazy />
```

- [ ] **Step 3: Build — confirm chunk split**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm --workspace @js-runtime-visualizer/ui run build
```

Expected: build emits at least TWO `dist/assets/index-*.js` chunks. The main chunk should drop well under 500 kB; CodeMirror lives in a secondary chunk loaded lazily. The Vite "chunks > 500kB" advisory should disappear (or become harmless because the lazy chunk is properly split).

- [ ] **Step 4: Tests + e2e still pass**

```bash
npx vitest --run
npm run e2e
```

Expected: vitest unchanged. e2e may need a small wait — Playwright already waits for `.cm-content` to appear, which now happens after the lazy chunk loads. Should still pass within the 30 s timeout.

If e2e times out at editor mount, raise the `await page.waitForSelector('.cm-content', { timeout: 10000 })` or switch to `page.waitForFunction(() => document.querySelector('.cm-content'))`. Document if you change it.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/EditorPaneLazy.tsx packages/ui/src/App.tsx
git commit -m "perf(ui): code-split CodeMirror via React.lazy"
```

---

## Task 16: Update e2e smoke for canvas + drag persistence

Plan-2's smoke asserted on the textual snapshot pane (`x: 5`, `<global>`). With the canvas, the assertions need to target the SVG. Also add a drag-persistence test.

**Files:**
- Modify: `packages/ui/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Replace the smoke spec**

Replace `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/e2e/smoke.spec.ts` with:

```ts
import { test, expect } from '@playwright/test';

test('type code → click Run → canvas shows nodes; step counter advances', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');

  // Wait for the editor to mount (lazy-loaded chunk).
  await page.waitForSelector('.cm-content', { timeout: 15_000 });

  // Replace editor contents.
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('let x = 5; console.log(x);');

  await page.getByRole('button', { name: 'Run' }).click();

  // Step counter is visible and shows "1 / N" (we land on step 0 = first event).
  const snapshotPane = page.locator('.snapshot');
  await expect(snapshotPane).toContainText(/step 1 \/ \d+/);

  // The canvas SVG is rendered.
  const svg = snapshotPane.locator('svg');
  await expect(svg).toBeVisible();

  // After advancing to the last step via ⏭, the heap contains an obj for console
  // and the global frame mentions the user binding.
  await page.getByRole('button', { name: '⏭' }).click();
  // Frame node text contains "x: 5" — user binding.
  await expect(snapshotPane).toContainText(/x:\s*5/);
  // Console pane shows the logged value.
  await expect(page.locator('.console')).toContainText('5');
});

test('drag a frame → reload → position persisted', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');

  await page.waitForSelector('.cm-content', { timeout: 15_000 });
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('let a = 1;');
  await page.getByRole('button', { name: 'Run' }).click();

  // Locate the global frame's drag header (the dark header rect inside the
  // first <g> containing "<global>").
  const headerRect = page.locator('text="<global>"').locator('..').locator('rect').first();
  await expect(headerRect).toBeVisible();

  const initialBox = await headerRect.boundingBox();
  if (!initialBox) throw new Error('Could not measure initial frame position');

  // Drag the header by (+200, +50).
  await page.mouse.move(initialBox.x + 20, initialBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(initialBox.x + 220, initialBox.y + 60, { steps: 10 });
  await page.mouse.up();

  // Read the localStorage to confirm the position was persisted.
  const stored = await page.evaluate(() => window.localStorage.getItem('jsrv:nodePositions'));
  expect(stored).toBeTruthy();
  expect(stored).toContain('"frame-0"');

  // Reload — position should restore.
  await page.reload();
  await page.waitForSelector('.cm-content', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Run' }).click();

  const reloadBox = await page.locator('text="<global>"').locator('..').locator('rect').first().boundingBox();
  if (!reloadBox) throw new Error('Could not measure reloaded frame position');

  // Allow up to 5px tolerance for sub-pixel rendering.
  expect(Math.abs(reloadBox.x - (initialBox.x + 200))).toBeLessThan(15);
});
```

- [ ] **Step 2: Run e2e**

```bash
cd /home/codelance/projects/js-runtime-visualizer
npm run e2e
```

Expected: 2 tests pass.

If the drag-persistence test is flaky on the agent host (timing/headless quirks), reduce the tolerance or use the `nodePositionsAtom` localStorage value as the assertion source rather than the rendered bounding box. Document if you weaken the assertion.

- [ ] **Step 3: Vitest also passes**

```bash
npx vitest --run
```

Expected: 83 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/tests/e2e/smoke.spec.ts
git commit -m "test(ui): canvas e2e — node visibility + drag persistence"
```

---

## Task 17: Standardise atom test scaffold + README + lint/format final

Plan-2 carry-over #5: the four atom test files use slightly different scaffolds (`session.test.ts` uses `context.reset()` per-test; the others use `vi.resetModules()`). Converge on `vi.resetModules()`. Plus README updates and final gate.

**Files:**
- Modify: `packages/ui/tests/atoms/session.test.ts` (standardise scaffold)
- Modify: `README.md` (project root) — flip plan-3 to ✅
- Modify: `packages/ui/README.md` (note canvas + drag)
- Run lint + format on all sources

- [ ] **Step 1: Standardise session.test.ts scaffold**

Read `/home/codelance/projects/js-runtime-visualizer/packages/ui/tests/atoms/session.test.ts`. Replace its `beforeEach` block so it matches `engine.test.ts` and `derived.test.ts`:

```ts
beforeEach(() => {
  vi.resetModules();
  fakeStorage.clear();
});
```

Remove any per-test `context.reset()` calls — `vi.resetModules()` re-runs Reatom's eager-IIFE and provides fresh isolation. Keep the dynamic imports inside each test body.

Run the file alone to confirm:

```bash
npx vitest --run packages/ui/tests/atoms/session.test.ts
```

Expected: 3 tests still pass.

- [ ] **Step 2: Update top-level README — flip plan-3 to ✅**

Edit `/home/codelance/projects/js-runtime-visualizer/README.md`. Replace this line:

```markdown
- [ ] **Plan 3** — canvas visualisation: pan/zoom SVG canvas, draggable frames + heap nodes, edges, collapse.
```

with:

```markdown
- [x] **Plan 3** — canvas visualisation: pan/zoom SVG canvas, draggable frames + heap nodes, reference edges, collapse, position persistence. _Completed 2026-05-08._
```

- [ ] **Step 3: Update UI package README**

Edit `/home/codelance/projects/js-runtime-visualizer/packages/ui/README.md`. Add a new section above the "Not yet (planned)" block:

```markdown
## Plan 3 additions (canvas)

- SVG canvas replaces the textual snapshot pane.
- Stack frames render as draggable, collapsible nodes on the left; heap objects on the right.
- Reference edges (variable → object, property → object) render as bezier paths between right-edge of source and left-edge of target.
- Pan: drag the empty canvas. Zoom: mouse wheel (cursor-anchored).
- Node positions and collapsed state persist to `localStorage` (`jsrv:nodePositions`, `jsrv:collapsedIds`).
- Auto-arrange button (toolbar) resets positions to the default layout.
- CodeMirror is now code-split into a lazy chunk to reduce the main bundle.
```

Then update the "Not yet (planned)" list to remove "SVG canvas with draggable frames" (since that ships in plan 3).

- [ ] **Step 4: Lint + format**

```bash
cd /home/codelance/projects/js-runtime-visualizer
./node_modules/.bin/eslint packages --ext .ts,.tsx
npx prettier --write "packages/**/*.{ts,tsx,css}"
./node_modules/.bin/eslint packages --ext .ts,.tsx
```

Expected: lint silent both before and after format.

- [ ] **Step 5: Final test gate**

```bash
npx vitest --run
npx tsc --noEmit -p packages/engine
npx tsc --noEmit -p packages/ui
npm --workspace @js-runtime-visualizer/ui run build
npm run e2e
```

Expected: 83 unit tests, both tsc invocations silent, vite build clean (chunk-size advisory should be gone or substantially smaller), 2 e2e tests pass.

- [ ] **Step 6: Commit**

If Prettier rewrote files, stage them too:

```bash
git add packages/ui/tests/atoms/session.test.ts README.md packages/ui/README.md packages/
git commit -m "docs: plan 3 complete — canvas viz + drag persistence + code-split"
```

---

## Done — what to expect

After all 17 tasks:

- The Snapshot pane is now an interactive SVG canvas. User runs code, sees frames + heap as nodes, drags them around, collapses, pans, zooms. Layout persists.
- Engine unchanged in behaviour; only the UI consumes a snapshot differently.
- 83 vitest unit + 2 Playwright e2e all pass.
- Bundle is split: main chunk should drop under ~250 kB; CodeMirror lazy-loads on demand.

Roll into **plan 4 — prototypes & inheritance** next: `class`/`extends`/`new`, `Object.create`, `__proto__`, `this` binding, `var`/function-decl hoisting, missing operators (`&&`, `||`, `??`, `?:`, compound assignment, named function-expression self-reference). Plan 4 also lands the closure visualisation (function HeapObject `[[Environment]]` block), prototype-chain edges (solid violet `[[Prototype]]`, dashed orange lookup highlight, dotted grey `.prototype`), and prototype-pollution UX.

---

## Self-review

- **Spec coverage**: §6.2 Canvas details — frames on canvas (left), heap on right (Tasks 8-11), draggable (Task 6 + 8 + 9), collapsible (Tasks 8 + 9), pan/zoom (Task 7 + 11), no graph-layout library (Task 3 hand-rolled), reference edges (Task 4 + 10). Prototype edges, lookup highlights, closure scope frames, error animation are explicitly out of scope and noted in the header.
- **Carry-over coverage**: plan-2 #1 (`nodePositions`) → Task 2; #2 (replace SnapshotPane) → Task 12; #3 (graph-layout decision) → Task 3 (hand-rolled, MIT-clear since no new dep); #4 (code-split CodeMirror) → Task 15; #5 (standardise test scaffold) → Task 17. plan-1 #4 (`lookup` event drill-in overload) is not addressed here — UI shows it as a normal lookup step via the `EVENT_LABELS` mapping; will be revisited in plan 4 if needed.
- **Type consistency**: `Pos`, `RefEdge`, `NodeKind`, `NodePositions`, `PanZoom`, `DragState` defined in Task 1; consumed in Tasks 2-11 with the same names. `frameKey(i)` defined in Task 3; consumed in Task 4 + Task 8 + Task 11. `extractRefEdges`, `defaultLayout`, `screenDeltaToCanvas` defined in their respective tasks and consumed downstream consistently.
- **No placeholders**: each step lists files, full code, exact commands, expected outputs, and commit messages.
- **No missing tests for non-trivial logic**: pure helpers (`defaultLayout`, `extractRefEdges`) have unit tests (Tasks 3 + 4). Atom logic has tests (Task 2). Components are exercised via the e2e smoke (Task 16). Drag/pan-zoom hooks are not unit-tested individually because their value is empirically verified in the e2e drag-persistence test; that's the right granularity for plan 3 and matches plan-2's UI testing pattern.
