import type { NodePositions, Pos, Snapshot } from '../types';

export const FRAME_X = 30;
export const FRAME_Y_START = 30;
export const FRAME_HEIGHT = 130;
export const HEAP_X_START = 320;
export const HEAP_Y_START = 30;
export const HEAP_HEIGHT = 130;

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
