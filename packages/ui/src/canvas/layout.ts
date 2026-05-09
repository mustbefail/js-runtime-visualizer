import type { FrameSnapshot, HeapObject, JSValue, NodePositions, Pos, Snapshot } from '../types';

export const FRAME_X = 30;
export const FRAME_Y_START = 30;
export const FRAME_HEIGHT = 170;
export const HEAP_X_START = 400;
export const HEAP_Y_START = 30;
export const HEAP_HEIGHT = 170;

export const frameKey = (index: number): string => `frame-${index}`;

export function defaultLayout(snap: Snapshot, existing: NodePositions): NodePositions {
  const out: NodePositions = new Map(existing);
  snap.callStack.forEach((_frame, i) => {
    const key = frameKey(i);
    if (!out.has(key)) {
      out.set(key, { x: FRAME_X, y: FRAME_Y_START + i * FRAME_HEIGHT });
    }
  });
  let heapIndex = 0;
  for (const [id] of snap.heap) {
    if (!out.has(id)) {
      out.set(id, { x: HEAP_X_START, y: HEAP_Y_START + heapIndex * HEAP_HEIGHT });
    }
    heapIndex++;
  }
  return out;
}

export function layoutExtent(positions: NodePositions): Pos {
  let maxX = 600;
  let maxY = 400;
  for (const { x, y } of positions.values()) {
    if (x + 200 > maxX) maxX = x + 200;
    if (y + 140 > maxY) maxY = y + 140;
  }
  return { x: maxX, y: maxY };
}

// ---------------------------------------------------------------------------
// Nested frame layout helpers
// ---------------------------------------------------------------------------

// Width of frame at depth `level` (0 = outermost). Shrinks per level, floored.
export const NESTED_FRAME_W_OUTER = 380;
export const NESTED_FRAME_PAD = 8;
const NESTED_FRAME_W_FLOOR = 240;

export function nestedFrameWidth(level: number): number {
  const w = NESTED_FRAME_W_OUTER - level * 2 * NESTED_FRAME_PAD;
  return Math.max(NESTED_FRAME_W_FLOOR, w);
}

const HEADER = 28;
const LINE = 20;

// Own (header + bindings only) height for a frame, given how many bindings
// it has and whether it's collapsed.
export function frameOwnHeight(bindingsCount: number, collapsed: boolean): number {
  const rows = collapsed ? 0 : Math.max(1, bindingsCount);
  return HEADER + (collapsed ? 0 : NESTED_FRAME_PAD + rows * LINE + NESTED_FRAME_PAD);
}

// Returns a view of the call stack with builtin bindings stripped from the
// global frame (index 0) when `showBuiltins` is false. Keeps every other
// frame untouched. Used by both layout and rendering so the visible row
// count and the actual rendered rows stay in sync.
export function filterBuiltinBindings(
  callStack: FrameSnapshot[],
  heap: Map<string, HeapObject>,
  showBuiltins: boolean,
): FrameSnapshot[] {
  if (showBuiltins || callStack.length === 0) return callStack;
  const out = callStack.slice();
  const global = out[0];
  if (!global) return out;
  const filtered = new Map<string, JSValue>();
  for (const [k, v] of global.bindings) {
    if (v.kind === 'ref' && heap.get(v.id)?.builtin) continue;
    filtered.set(k, v);
  }
  out[0] = { ...global, bindings: filtered };
  return out;
}

// Compute absolute positions for every frame in a nested layout, given the
// root frame's position.
export function computeNestedFramePositions(
  callStack: FrameSnapshot[],
  collapsedIds: Set<string>,
  rootPos: Pos,
): Map<string, Pos> {
  const out = new Map<string, Pos>();
  let curX = rootPos.x;
  let curY = rootPos.y;
  for (let i = 0; i < callStack.length; i++) {
    const key = frameKey(i);
    out.set(key, { x: curX, y: curY });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const frame = callStack[i]!;
    const collapsed = collapsedIds.has(key);
    const ownH = frameOwnHeight(frame.bindings.size, collapsed);
    curX += NESTED_FRAME_PAD;
    curY += ownH;
  }
  return out;
}
