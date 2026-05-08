import { describe, it, expect } from 'vitest';
import { Heap } from '../src/runtime/heap';
import { CallStack } from '../src/runtime/frames';
import { EnvironmentRecord } from '../src/runtime/env';
import { num } from '../src/types';
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
    expect(snap.callStack[0]?.fnName).toBe('<global>');
  });

  it('returns immutable snapshots — later mutation does not affect captured state', () => {
    const heap = new Heap();
    const ref = heap.allocate({
      kind: 'object',
      ownProps: new Map([['n', num(1)]]),
      prototype: null,
    });
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

  it('does not transitively freeze the caller-provided highlights object', () => {
    const heap = new Heap();
    const stack = new CallStack();
    const myHighlights: { changedIds?: string[] } = { changedIds: ['x'] };

    const store = new SnapshotStore();
    store.capture({
      eventKind: 'mutate',
      loc: { line: 1, col: 0 },
      heap,
      stack,
      consoleOut: [],
      highlights: myHighlights,
    });

    // The caller should still be able to mutate its own highlights object.
    expect(() => {
      myHighlights.changedIds = ['y'];
    }).not.toThrow();
    // The captured snapshot is still independent and frozen.
    expect(store.at(0).highlights.changedIds).toEqual(['x']);
  });
});
