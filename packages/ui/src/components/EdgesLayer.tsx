import { useAtom } from '@reatom/react';
import { dragStateAtom } from '../atoms/canvas';
import type { DragState, NodePositions, Pos, RefEdge } from '../types';

const FRAME_W = 260;
const HEAP_W = 240;
const NODE_HEADER_H = 22;

function nodeWidth(kind: 'frame' | 'heap'): number {
  return kind === 'frame' ? FRAME_W : HEAP_W;
}

function rightAnchor(kind: 'frame' | 'heap', pos: Pos): Pos {
  return { x: pos.x + nodeWidth(kind), y: pos.y + NODE_HEADER_H + 6 };
}

function leftAnchor(pos: Pos): Pos {
  return { x: pos.x, y: pos.y + NODE_HEADER_H + 6 };
}

function getPos(
  id: string,
  positions: NodePositions,
  drag: DragState,
): Pos | null {
  if (drag.active && drag.id === id) return drag.pos;
  return positions.get(id) ?? null;
}

export function EdgesLayer(props: { edges: RefEdge[]; positions: NodePositions }) {
  const [drag] = useAtom(dragStateAtom);
  return (
    <g>
      {props.edges.map((e, i) => {
        const fromPos = getPos(e.fromId, props.positions, drag);
        const toPos = getPos(e.toId, props.positions, drag);
        if (!fromPos || !toPos) return null;
        const start = rightAnchor(e.fromKind, fromPos);
        const end = leftAnchor(toPos);
        const dx = Math.max(40, (end.x - start.x) / 2);
        const c1 = { x: start.x + dx, y: start.y };
        const c2 = { x: end.x - dx, y: end.y };
        const d = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
        return (
          <path
            key={`${e.fromId}-${e.fromLabel}-${e.toId}-${i}`}
            d={d}
            fill="none"
            stroke={e.edgeKind === 'proto' ? 'var(--accent2)' : 'var(--info)'}
            strokeWidth={e.edgeKind === 'proto' ? 2 : 1.5}
            opacity={0.85}
            markerEnd={e.edgeKind === 'proto' ? 'url(#arrowhead-proto)' : 'url(#arrowhead)'}
          >
            <title>{`${e.fromLabel} → ${e.toId}`}</title>
          </path>
        );
      })}
    </g>
  );
}
