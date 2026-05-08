import { useAtom } from '@reatom/react';
import { currentSnapshotAtom } from '../atoms/derived';

export function ConsoleView() {
  const [snap] = useAtom(currentSnapshotAtom);
  const lines = snap?.consoleOut ?? [];
  return (
    <div className="console">
      <div className="section-title">Console</div>
      {lines.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 11 }}>(no output)</div>
      ) : (
        lines.map((line, i) => (
          <div key={i}>
            <span style={{ color: 'var(--muted)' }}>{i + 1}</span> {line}
          </div>
        ))
      )}
    </div>
  );
}
