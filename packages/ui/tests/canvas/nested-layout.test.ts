import { describe, expect, it } from 'vitest';
import {
  computeNestedFramePositions,
  frameOwnHeight,
  frameKey,
  nestedFrameWidth,
  NESTED_FRAME_PAD,
} from '../../src/canvas/layout';
import type { FrameSnapshot } from '../../src/types';

function makeFrame(name: string, bindingsCount: number): FrameSnapshot {
  const bindings = new Map<string, never>();
  for (let i = 0; i < bindingsCount; i++) {
    bindings.set(`b${i}`, { kind: 'undefined' } as never);
  }
  return { fnName: name, callSite: null, bindings: bindings as never };
}

describe('nested frame layout', () => {
  it('frame 0 is at root position', () => {
    const stack = [makeFrame('<global>', 0)];
    const out = computeNestedFramePositions(stack, new Set(), { x: 30, y: 30 });
    expect(out.get(frameKey(0))).toEqual({ x: 30, y: 30 });
  });

  it('frame 1 is offset by PAD on x and parent ownHeight on y', () => {
    const stack = [makeFrame('<global>', 2), makeFrame('outer', 0)];
    const out = computeNestedFramePositions(stack, new Set(), { x: 30, y: 30 });
    const ownH0 = frameOwnHeight(2, false);
    expect(out.get(frameKey(1))).toEqual({
      x: 30 + NESTED_FRAME_PAD,
      y: 30 + ownH0,
    });
  });

  it('width shrinks per level but floors at minimum', () => {
    expect(nestedFrameWidth(0)).toBe(380);
    expect(nestedFrameWidth(1)).toBe(364);
    // Deep enough levels floor at 240.
    expect(nestedFrameWidth(20)).toBe(240);
  });

  it('collapsed frame has only header height', () => {
    expect(frameOwnHeight(5, true)).toBe(28);
    expect(frameOwnHeight(0, true)).toBe(28);
  });
});
