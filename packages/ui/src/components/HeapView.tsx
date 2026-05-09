import { useAtom } from '@reatom/react';
import { currentSnapshotAtom } from '../atoms/derived';
import type { HeapObject, JSValue } from '../types';

function renderValue(v: JSValue): string {
  switch (v.kind) {
    case 'undefined':
      return 'undefined';
    case 'null':
      return 'null';
    case 'boolean':
    case 'number':
      return String(v.value);
    case 'string':
      return JSON.stringify(v.value);
    case 'ref':
      return `→ ${v.id}`;
  }
}

function getPrimaryLabel(obj: HeapObject, heap: Map<string, HeapObject>): string {
  if (obj.kind === 'function') {
    const name = obj.source?.name;
    return name ? `ƒ ${name}` : 'ƒ <anon>';
  } else if (obj.kind === 'array') {
    return 'array';
  } else {
    const ctor = obj.ownProps.get('constructor');
    if (ctor && ctor.kind === 'ref') {
      const ctorObj = heap.get(ctor.id);
      const ctorName = ctorObj?.source?.name;
      if (ctorName) return `${ctorName}.prototype`;
    }
    return 'object';
  }
}

function renderObject(obj: HeapObject, id: string, heap: Map<string, HeapObject>) {
  const labelColor =
    obj.kind === 'function'
      ? 'var(--info)'
      : obj.kind === 'array'
        ? 'var(--accent)'
        : 'var(--good)';
  const primaryLabel = getPrimaryLabel(obj, heap);
  return (
    <div
      key={id}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 6,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: labelColor }}>{primaryLabel}</span>
        <span style={{ color: 'var(--muted)', fontSize: 10 }}>#{id}</span>
      </div>
      {Array.from(obj.ownProps.entries()).map(([k, v]) => (
        <div key={k} style={{ paddingLeft: 6, color: 'var(--text)' }}>
          <span style={{ color: 'var(--good)' }}>{k}</span>: {renderValue(v)}
        </div>
      ))}
      {obj.ownProps.size === 0 && (
        <div style={{ paddingLeft: 6, color: 'var(--muted)', fontSize: 10 }}>(no own props)</div>
      )}
    </div>
  );
}

export function HeapView() {
  const [snap] = useAtom(currentSnapshotAtom);
  if (!snap) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="section-title">Heap ({snap.heap.size})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from(snap.heap.entries()).map(([id, obj]) => renderObject(obj, id, snap.heap))}
        {snap.heap.size === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>(empty)</div>}
      </div>
    </div>
  );
}
