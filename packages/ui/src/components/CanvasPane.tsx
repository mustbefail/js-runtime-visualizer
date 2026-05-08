import { useMemo } from 'react';
import { useAtom } from '@reatom/react';
import { currentSnapshotAtom, totalStepsAtom } from '../atoms/derived';
import { currentStepIndexAtom } from '../atoms/ui';
import { nodePositionsAtom } from '../atoms/session';
import { panZoomAtom } from '../atoms/canvas';
import { defaultLayout, frameKey } from '../canvas/layout';
import { extractRefEdges } from '../canvas/refs';
import { usePanZoom } from '../canvas/usePanZoom';
import { FrameNode } from './FrameNode';
import { HeapNode } from './HeapNode';
import { EdgesLayer } from './EdgesLayer';
import { CanvasLegend } from './CanvasLegend';
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

export function CanvasPane() {
  const [snap] = useAtom(currentSnapshotAtom);
  const [step] = useAtom(currentStepIndexAtom);
  const [total] = useAtom(totalStepsAtom);
  const [positions] = useAtom(nodePositionsAtom);
  const [pz] = useAtom(panZoomAtom);
  const { onMouseDown, onWheel } = usePanZoom();

  const laidOut = useMemo(
    () => (snap ? defaultLayout(snap, positions) : positions),
    [snap, positions],
  );
  const edges = useMemo(() => (snap ? extractRefEdges(snap) : []), [snap]);

  return (
    <div className="snapshot" style={{ padding: 0, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          right: 12,
          display: 'flex',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        <strong>Snapshot</strong>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          {snap
            ? `step ${step + 1} / ${total} · ${EVENT_LABELS[snap.eventKind] ?? snap.eventKind} @ L${snap.loc.line}`
            : '(no run)'}
        </span>
      </div>
      <svg
        width="100%"
        height="100%"
        style={{ display: 'block', cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--info)" />
          </marker>
        </defs>
        <g transform={`translate(${pz.panX}, ${pz.panY}) scale(${pz.scale})`}>
          {snap && (
            <>
              <EdgesLayer edges={edges} />
              {snap.callStack.map((frame, i) => {
                const pos = laidOut.get(frameKey(i));
                if (!pos) return null;
                return (
                  <FrameNode
                    key={`frame-${i}`}
                    index={i}
                    frame={frame}
                    isTop={i === snap.callStack.length - 1}
                    pos={pos}
                  />
                );
              })}
              {Array.from(snap.heap.entries()).map(([id, obj]) => {
                const pos = laidOut.get(id);
                if (!pos) return null;
                return <HeapNode key={id} id={id} obj={obj} pos={pos} />;
              })}
            </>
          )}
        </g>
      </svg>
      <CanvasLegend />
    </div>
  );
}
