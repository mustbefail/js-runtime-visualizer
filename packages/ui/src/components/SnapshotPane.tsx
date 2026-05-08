import { useAtom } from '@reatom/react';
import { CallStackView } from './CallStackView';
import { HeapView } from './HeapView';
import { currentSnapshotAtom, totalStepsAtom } from '../atoms/derived';
import { currentStepIndexAtom } from '../atoms/ui';
import type { EventKind } from '../types';

const EVENT_LABELS: Record<EventKind, string> = {
  'enter-frame': 'Function entered',
  'leave-frame': 'Function returned',
  assign: 'Variable assigned',
  allocate: 'Object allocated',
  lookup: 'Variable read',
  mutate: 'Property updated',
  console: 'console.log',
};

export function SnapshotPane() {
  const [snap] = useAtom(currentSnapshotAtom);
  const [step] = useAtom(currentStepIndexAtom);
  const [total] = useAtom(totalStepsAtom);
  const eventLabel = snap ? EVENT_LABELS[snap.eventKind] ?? snap.eventKind : null;
  return (
    <div className="snapshot">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>Snapshot</strong>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          {snap
            ? `step ${step + 1} / ${total} · ${eventLabel} @ L${snap.loc.line}`
            : '(no run)'}
        </span>
      </div>
      <CallStackView />
      <HeapView />
    </div>
  );
}
