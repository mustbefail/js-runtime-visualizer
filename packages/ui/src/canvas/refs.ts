import type { JSValue, RefEdge, Snapshot } from '../types';
import { frameKey } from './layout';

function isRef(v: JSValue): v is { kind: 'ref'; id: string } {
  return v.kind === 'ref';
}

export function extractRefEdges(snap: Snapshot): RefEdge[] {
  const out: RefEdge[] = [];
  snap.callStack.forEach((frame, i) => {
    for (const [name, value] of frame.bindings) {
      if (isRef(value)) {
        out.push({
          fromKind: 'frame',
          fromId: frameKey(i),
          fromLabel: name,
          toId: value.id,
        });
      }
    }
  });
  for (const [id, obj] of snap.heap) {
    for (const [key, value] of obj.ownProps) {
      if (isRef(value)) {
        out.push({
          fromKind: 'heap',
          fromId: id,
          fromLabel: key,
          toId: value.id,
        });
      }
    }
  }
  return out;
}
