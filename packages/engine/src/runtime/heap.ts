import type { HeapObject, IHeap, JSValue, Reference } from '../types';

export class Heap implements IHeap {
  private store = new Map<string, HeapObject>();
  private nextId = 1;

  private freshId(): string {
    return `obj${this.nextId++}`;
  }

  allocate(obj: HeapObject): Reference {
    const id = this.freshId();
    this.store.set(id, obj);
    return { kind: 'ref', id };
  }

  get(id: string): HeapObject | undefined {
    return this.store.get(id);
  }

  setProp(id: string, key: string, value: JSValue): void {
    const obj = this.store.get(id);
    if (!obj) throw new Error(`heap: no object with id ${id}`);
    obj.ownProps.set(key, value);
  }

  size(): number {
    return this.store.size;
  }

  entries(): IterableIterator<[string, HeapObject]> {
    return this.store.entries();
  }

  // Used by SnapshotStore to clone. Returns a new Map with shallow object copies.
  snapshot(): Map<string, HeapObject> {
    const out = new Map<string, HeapObject>();
    for (const [id, obj] of this.store) {
      out.set(id, {
        ...obj,
        ownProps: new Map(obj.ownProps),
      });
    }
    return out;
  }
}
