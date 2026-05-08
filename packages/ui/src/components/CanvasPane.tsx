import { useMemo } from 'react';
import { useAtom } from '@reatom/react';
import { currentSnapshotAtom, totalStepsAtom } from '../atoms/derived';
import { currentStepIndexAtom } from '../atoms/ui';
import { nodePositionsAtom } from '../atoms/session';
import { panZoomAtom, showBuiltinsAtom } from '../atoms/canvas';
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
  'proto-walk': 'Walked [[Prototype]] chain',
  'proto-set': '[[Prototype]] set',
  'bind-this': 'this bound',
};

export function CanvasPane() {
  const [snap] = useAtom(currentSnapshotAtom);
  const [step] = useAtom(currentStepIndexAtom);
  const [total] = useAtom(totalStepsAtom);
  const [positions] = useAtom(nodePositionsAtom);
  const [pz] = useAtom(panZoomAtom);
  const [showBuiltins] = useAtom(showBuiltinsAtom);
  const { onMouseDown, onWheel } = usePanZoom();

  const visibleHeap = useMemo(() => {
    if (!snap) return [];
    const all = Array.from(snap.heap.entries());
    return showBuiltins ? all : all.filter(([, obj]) => !obj.builtin);
  }, [snap, showBuiltins]);

  const hiddenBuiltinCount = useMemo(() => {
    if (!snap) return 0;
    if (showBuiltins) return 0;
    let count = 0;
    for (const [, obj] of snap.heap) if (obj.builtin) count++;
    return count;
  }, [snap, showBuiltins]);

  const visibleHeapIds = useMemo(() => new Set(visibleHeap.map(([id]) => id)), [visibleHeap]);

  const laidOut = useMemo(
    () => (snap ? defaultLayout(snap, positions) : positions),
    [snap, positions],
  );
  const edges = useMemo(() => (snap ? extractRefEdges(snap) : []), [snap]);

  const visibleEdges = useMemo(
    () =>
      edges.filter((e) => {
        // For frame-source edges, the fromId is a synthetic frame key — always visible.
        // For heap-source edges, both endpoints must be in visibleHeapIds.
        if (e.fromKind === 'heap' && !visibleHeapIds.has(e.fromId)) return false;
        if (!visibleHeapIds.has(e.toId)) return false;
        return true;
      }),
    [edges, visibleHeapIds],
  );

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
            ? `step ${step + 1} / ${total} · ${EVENT_LABELS[snap.eventKind] ?? snap.eventKind} @ L${snap.loc.line}${
                hiddenBuiltinCount > 0 ? ` · ${hiddenBuiltinCount} builtins hidden` : ''
              }`
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
          <marker
            id="arrowhead-proto"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent2)" />
          </marker>
        </defs>
        <g transform={`translate(${pz.panX}, ${pz.panY}) scale(${pz.scale})`}>
          {snap && (
            <>
              <EdgesLayer edges={visibleEdges} positions={laidOut} />
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
              {visibleHeap.map(([id, obj]) => {
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
