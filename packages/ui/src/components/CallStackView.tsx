import { useAtom } from '@reatom/react';
import { currentSnapshotAtom } from '../atoms/derived';
import type { JSValue } from '../types';

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

export function CallStackView() {
  const [snap] = useAtom(currentSnapshotAtom);
  if (!snap) {
    return (
      <div>
        <div className="section-title">Call stack</div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>(no snapshot)</div>
      </div>
    );
  }
  return (
    <div>
      <div className="section-title">Call stack ({snap.callStack.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {snap.callStack
          .slice()
          .reverse()
          .map((frame, idxFromTop) => {
            const original = snap.callStack.length - 1 - idxFromTop;
            const isTop = idxFromTop === 0;
            return (
              <div
                key={`${original}-${frame.fnName}`}
                style={{
                  background: 'var(--panel)',
                  border: `1px solid ${isTop ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6,
                  padding: 6,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: isTop ? 'var(--accent)' : 'var(--info)' }}>
                    {isTop ? '▶ ' : '  '}
                    {frame.fnName}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 10 }}>
                    {frame.callSite ? `L${frame.callSite.line}` : ''}
                  </span>
                </div>
                {Array.from(frame.bindings.entries()).map(([k, v]) => (
                  <div key={k} style={{ paddingLeft: 6, color: 'var(--text)' }}>
                    <span style={{ color: 'var(--good)' }}>{k}</span>: {renderValue(v)}
                  </div>
                ))}
                {frame.bindings.size === 0 && (
                  <div style={{ paddingLeft: 6, color: 'var(--muted)', fontSize: 10 }}>
                    (no bindings)
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
