import { useAtom, useAction } from '@reatom/react';
import { action } from '@reatom/core';
import { tracebackAtom } from '../atoms/derived';
import { currentStepIndexAtom } from '../atoms/ui';

const jumpToStep = action((i: number) => currentStepIndexAtom.set(i), 'jumpToStep');

export function TracebackPanel() {
  const [tb] = useAtom(tracebackAtom);
  const onJump = useAction(jumpToStep);

  if (!tb) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 36,
        left: 12,
        right: 12,
        zIndex: 2,
        background: 'var(--panel-2)',
        border: '1px solid var(--bad)',
        borderRadius: 6,
        padding: 8,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        color: 'var(--text)',
        maxHeight: 220,
        overflow: 'auto',
      }}
    >
      <div style={{ color: 'var(--bad)', fontWeight: 'bold', marginBottom: 4 }}>
        ⊗ {tb.message || 'Error thrown'}
        {tb.caught && (
          <span style={{ color: 'var(--good)', fontWeight: 'normal', marginLeft: 8 }}>
            (caught)
          </span>
        )}
      </div>
      {tb.frames.map((f, i) => (
        <div
          key={`${i}-${f.fnName}`}
          onClick={() => onJump(f.enterStep)}
          style={{
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'var(--panel)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }}
        >
          <span style={{ color: 'var(--muted)' }}>{i === 0 ? '▶ ' : '↑ '}</span>
          <span style={{ color: i === 0 ? 'var(--accent)' : 'var(--info)' }}>at {f.fnName}</span>
          {f.callSite && (
            <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
              (snippet.js:{f.callSite.line})
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
