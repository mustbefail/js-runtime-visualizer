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
      edgeKind: 'ref',
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
      edgeKind: 'ref',
    });
  });

  it('skips primitives and emits nothing for binding-less frames', () => {
    const snap = snapWith({
      frameBindings: [new Map([['x', { kind: 'number', value: 1 }]])],
    });
    expect(extractRefEdges(snap)).toEqual([]);
  });

  it('emits a proto edge for each heap object with a [[Prototype]]', () => {
    const snap = snapWith({
      heap: [
        ['obj1', new Map()],
        ['obj2', new Map()],
      ],
    });
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

  it('suppresses the auto-allocated Foo.prototype.constructor back-edge', () => {
    // Build a snapshot where obj1 is the function and obj2 is its auto-proto,
    // both linking to each other (the JS auto-allocated pattern).
    const snap = snapWith({
      heap: [
        ['obj1', new Map([['prototype', { kind: 'ref', id: 'obj2' }]])],
        ['obj2', new Map([['constructor', { kind: 'ref', id: 'obj1' }]])],
      ],
    });
    // Make obj1 a function so the heuristic fires.
    snap.heap.get('obj1')!.kind = 'function' as never;
    const edges = extractRefEdges(snap);
    // Should emit obj1.prototype → obj2, but NOT obj2.constructor → obj1.
    const fromConstructor = edges.find(
      (e) => e.fromKind === 'heap' && e.fromId === 'obj2' && e.fromLabel === 'constructor',
    );
    expect(fromConstructor).toBeUndefined();
    const fromPrototype = edges.find((e) => e.fromLabel === 'prototype');
    expect(fromPrototype).toBeDefined();
  });
});
