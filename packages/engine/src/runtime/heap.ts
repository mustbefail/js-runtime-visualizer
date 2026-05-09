import type { HeapObject, IHeap, JSValue, Reference } from '../types';
import { bindingsEqual, walkClosureBindings } from './env';

export class Heap implements IHeap {
  private store = new Map<string, HeapObject>();
  private nextId = 1;

  // Tracks ids that have been allocated or mutated since the last snapshot().
  // Cleared when snapshot() is called.
  private dirtyIds = new Set<string>();

  // The Map returned by the most recent snapshot() call. Used to reuse
  // HeapObject references for ids that were not modified since.
  private lastSnapshot: Map<string, HeapObject> | null = null;

  private freshId(): string {
    return `obj${this.nextId++}`;
  }

  allocate(obj: HeapObject): Reference {
    const id = this.freshId();
    this.store.set(id, obj);
    this.dirtyIds.add(id);
    return { kind: 'ref', id };
  }

  get(id: string): HeapObject | undefined {
    return this.store.get(id);
  }

  setProp(id: string, key: string, value: JSValue): void {
    const obj = this.store.get(id);
    if (!obj) throw new Error(`heap: no object with id ${id}`);
    obj.ownProps.set(key, value);
    this.dirtyIds.add(id);
  }

  setPrototype(id: string, proto: Reference | null): void {
    const obj = this.store.get(id);
    if (!obj) throw new Error(`heap: no object with id ${id}`);
    obj.prototype = proto;
    this.dirtyIds.add(id);
  }

  size(): number {
    return this.store.size;
  }

  entries(): IterableIterator<[string, HeapObject]> {
    return this.store.entries();
  }

  // Returns a Map of HeapObjects representing the heap at the moment of capture.
  // Unchanged ids reuse the HeapObject reference from the previous snapshot —
  // memory cost is O(allocations + mutations), not O(heap-size).
  snapshot(): Map<string, HeapObject> {
    const out = new Map<string, HeapObject>();
    const prev = this.lastSnapshot;
    for (const [id, obj] of this.store) {
      const isDirty = this.dirtyIds.has(id);
      const prevEntry = prev?.get(id);

      // For user-defined functions, the [[Environment]] view must reflect the
      // live closure bindings at this step, not the values frozen at allocation.
      // Recompute and treat any change as a reason to bust structural sharing.
      const freshBindings =
        obj.kind === 'function' && obj.closure
          ? walkClosureBindings(obj.closure, obj.source?.freeVars)
          : null;

      if (freshBindings) {
        const prevBindings = prevEntry?.source?.capturedBindings;
        const bindingsChanged = !prevBindings || !bindingsEqual(freshBindings, prevBindings);
        if (isDirty || !prevEntry || bindingsChanged) {
          const copy: HeapObject = { ...obj, ownProps: new Map(obj.ownProps) };
          if (obj.source) {
            copy.source = { ...obj.source, capturedBindings: freshBindings };
          }
          out.set(id, copy);
        } else {
          out.set(id, prevEntry);
        }
        continue;
      }

      if (isDirty || !prevEntry) {
        // Allocate a fresh shallow copy with a fresh ownProps Map so future
        // mutations to `this.store` cannot leak into this snapshot.
        out.set(id, { ...obj, ownProps: new Map(obj.ownProps) });
      } else {
        // Unmodified: reuse the previous snapshot's frozen-isolated copy.
        out.set(id, prevEntry);
      }
    }
    this.lastSnapshot = out;
    this.dirtyIds.clear();
    return out;
  }
}
