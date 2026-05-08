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
    heap.setProp(ref.id, 'name', { kind: 'string', value: 'Rex' });
    expect(heap.get(ref.id)?.ownProps.get('name')).toEqual({ kind: 'string', value: 'Rex' });
  });

  it('iterates all live objects', () => {
    const heap = new Heap();
    heap.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    heap.allocate({ kind: 'array', ownProps: new Map(), prototype: null });
    expect(heap.size()).toBe(2);
    const kinds = [...heap.entries()].map(([, o]) => o.kind);
    expect(kinds.sort()).toEqual(['array', 'object']);
  });

  it('uses per-instance id counter — two Heaps do not share the id sequence', () => {
    const a = new Heap();
    const b = new Heap();
    const refA1 = a.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    const refB1 = b.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    const refA2 = a.allocate({ kind: 'object', ownProps: new Map(), prototype: null });
    expect(refA1.id).toBe('obj1');
    expect(refB1.id).toBe('obj1');  // independent counter
    expect(refA2.id).toBe('obj2');
  });
});
