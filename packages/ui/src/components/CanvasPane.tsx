import { useMemo } from 'react';
import { useAtom } from '@reatom/react';
import { currentSnapshotAtom, totalStepsAtom } from '../atoms/derived';
import { currentStepIndexAtom } from '../atoms/ui';
import { nodePositionsAtom, collapsedIdsAtom } from '../atoms/session';
import { panZoomAtom, showBuiltinsAtom, dragStateAtom } from '../atoms/canvas';
import { defaultLayout, frameKey, computeNestedFramePositions } from '../canvas/layout';
import { extractRefEdges } from '../canvas/refs';
import { usePanZoom } from '../canvas/usePanZoom';
import { FrameNode } from './FrameNode';
import { HeapNode } from './HeapNode';
import { EdgesLayer } from './EdgesLayer';
import { CanvasLegend } from './CanvasLegend';
import { TracebackPanel } from './TracebackPanel';
import { EVENT_LABELS } from '../canvas/eventLabels';

export function CanvasPane() {
  const [snap] = useAtom(currentSnapshotAtom);
  const [step] = useAtom(currentStepIndexAtom);
  const [total] = useAtom(totalStepsAtom);
  const [positions] = useAtom(nodePositionsAtom);
  const [pz] = useAtom(panZoomAtom);
  const [showBuiltins] = useAtom(showBuiltinsAtom);
  const [collapsed] = useAtom(collapsedIdsAtom);
  const [drag] = useAtom(dragStateAtom);
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

  const laidOut = useMemo(() => {
    if (!snap) return positions;
    const baseLayout = defaultLayout(snap, positions);
    const rootKey = frameKey(0);
    const liveRoot = drag.active && drag.id === rootKey ? drag.pos : null;
    const rootPos = liveRoot ?? baseLayout.get(rootKey) ?? { x: 30, y: 30 };
    const nested = computeNestedFramePositions(snap.callStack, collapsed, rootPos);
    const merged = new Map(baseLayout);
    for (const [k, v] of nested) merged.set(k, v);
    return merged;
  }, [snap, positions, collapsed, drag]);
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
    <div className="snapshot" data-testid="snapshot-pane" style={{ padding: 0, position: 'relative' }}>
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
      <TracebackPanel />
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
              {snap.callStack.length > 0 && (() => {
                const rootPos = laidOut.get(frameKey(0));
                if (!rootPos) return null;
                return (
                  <FrameNode
                    callStack={snap.callStack}
                    index={0}
                    level={0}
                    pos={rootPos}
                    isErrorTopFrame={snap.eventKind === 'error'}
                  />
                );
              })()}
              {visibleHeap.map(([id, obj]) => {
                const pos = laidOut.get(id);
                if (!pos) return null;
                return <HeapNode key={id} id={id} obj={obj} pos={pos} heap={snap.heap} />;
              })}
            </>
          )}
        </g>
      </svg>
      <CanvasLegend />
    </div>
  );
}
