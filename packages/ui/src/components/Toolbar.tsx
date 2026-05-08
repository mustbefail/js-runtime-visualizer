import { useAtom, useAction } from '@reatom/react';
import { action } from '@reatom/core';
import { drillInAtom } from '../atoms/session';
import { runErrorAtom } from '../atoms/engine';
import { runAction, resetAction } from '../atoms/actions';

const toggleDrillInAction = action(() => drillInAtom.set((prev) => !prev), 'toggleDrillInAction');

export function Toolbar() {
  const [drillIn] = useAtom(drillInAtom);
  const [runError] = useAtom(runErrorAtom);
  const onRun = useAction(runAction);
  const onReset = useAction(resetAction);
  const onToggleDrillIn = useAction(toggleDrillInAction);

  return (
    <div
      className="toolbar"
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}
    >
      <strong>JS Runtime Visualizer</strong>
      <div style={{ flex: 1 }} />
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: 'var(--muted)',
        }}
      >
        <input type="checkbox" checked={drillIn} onChange={onToggleDrillIn} />
        drill-in
      </label>
      <button onClick={onRun}>Run</button>
      <button onClick={onReset}>Reset</button>
      {runError && (
        <span style={{ color: 'var(--bad)', fontSize: 12, marginLeft: 8 }} title={runError}>
          ⊗ error
        </span>
      )}
    </div>
  );
}
