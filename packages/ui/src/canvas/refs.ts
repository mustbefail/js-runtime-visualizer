import type { HeapObject, JSValue, RefEdge, Snapshot } from '../types';
import { frameKey } from './layout';

function isRef(v: JSValue): v is { kind: 'ref'; id: string } {
  return v.kind === 'ref';
}

function isAutoProtoConstructorEdge(
  fromId: string,
  fromObj: HeapObject,
  key: string,
  toId: string,
  heap: Map<string, HeapObject>,
): boolean {
  if (key !== 'constructor') return false;
  if (fromObj.kind !== 'object') return false;
  const ctorObj = heap.get(toId);
  if (!ctorObj || ctorObj.kind !== 'function') return false;
  const ctorProto = ctorObj.ownProps.get('prototype');
  if (!ctorProto || ctorProto.kind !== 'ref') return false;
  return ctorProto.id === fromId;
}

export function extractRefEdges(snap: Snapshot): RefEdge[] {
  const out: RefEdge[] = [];
  // Frame bindings → heap.
  snap.callStack.forEach((frame, i) => {
    for (const [name, value] of frame.bindings) {
      if (isRef(value)) {
        out.push({
          fromKind: 'frame',
          fromId: frameKey(i),
          fromLabel: name,
          toId: value.id,
          edgeKind: 'ref',
        });
      }
    }
  });
  // Heap object ownProps → heap.
  for (const [id, obj] of snap.heap) {
    for (const [key, value] of obj.ownProps) {
      if (isRef(value)) {
        if (isAutoProtoConstructorEdge(id, obj, key, value.id, snap.heap)) continue;
        out.push({
          fromKind: 'heap',
          fromId: id,
          fromLabel: key,
          toId: value.id,
          edgeKind: 'ref',
        });
      }
    }
    if (obj.prototype && obj.prototype.kind === 'ref') {
      out.push({
        fromKind: 'heap',
        fromId: id,
        fromLabel: '[[Prototype]]',
        toId: obj.prototype.id,
        edgeKind: 'proto',
      });
    }
  }
  return out;
}
