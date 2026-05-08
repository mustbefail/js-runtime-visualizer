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
