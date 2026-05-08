import { useAtom, useFrame } from '@reatom/react';
import { collapsedIdsAtom } from '../atoms/session';
import { dragStateAtom } from '../atoms/canvas';
import { useDrag } from '../canvas/useDrag';
import { frameKey } from '../canvas/layout';
import type { FrameSnapshot, JSValue, Pos } from '../types';

const FRAME_W = 260;

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

export function FrameNode(props: {
  index: number;
  frame: FrameSnapshot;
  isTop: boolean;
  pos: Pos;
}) {
  const { index, frame, isTop, pos } = props;
  const id = frameKey(index);
  const [collapsed] = useAtom(collapsedIdsAtom);
  const [drag] = useAtom(dragStateAtom);
  const reatomFrame = useFrame();

  // Live position during drag; fall back to static prop when idle.
  const renderPos = drag.active && drag.id === id ? drag.pos : pos;
  const isCollapsed = collapsed.has(id);
  const drager = useDrag(id, renderPos);

  const onTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    reatomFrame.run(() => {
      const next = new Set(collapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      collapsedIdsAtom.set(next);
    });
  };

  const titleColor = isTop ? 'var(--accent)' : 'var(--info)';
  const borderColor = isTop ? 'var(--accent)' : 'var(--border)';
  const headerHeight = 22;
  const lineHeight = 16;
  const padding = 6;
  const bindings = isCollapsed ? [] : Array.from(frame.bindings.entries());
  const height =
    headerHeight + (isCollapsed ? 0 : padding + bindings.length * lineHeight + padding);

  return (
    <g transform={`translate(${renderPos.x}, ${renderPos.y})`}>
      <rect
        width={FRAME_W}
        height={height}
        rx={6}
        fill="var(--panel)"
        stroke={borderColor}
        strokeWidth={isTop ? 2 : 1}
      />
      <rect
        width={FRAME_W}
        height={headerHeight}
        rx={6}
        fill="rgba(0,0,0,0.2)"
        onMouseDown={drager.onMouseDown}
        style={{ cursor: 'move' }}
      />
      <text
        x={8}
        y={15}
        fontSize={11}
        fontFamily="JetBrains Mono, monospace"
        fill={titleColor}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {isTop ? '▶ ' : ''}
        {frame.fnName}
      </text>
      <text
        x={FRAME_W - 8}
        y={15}
        fontSize={9}
        fontFamily="JetBrains Mono, monospace"
        textAnchor="end"
        fill="var(--muted)"
        onClick={onTitleClick}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {isCollapsed ? '▸' : '▾'}
      </text>
      {!isCollapsed &&
        bindings.map(([k, v], i) => (
          <text
            key={k}
            x={10}
            y={headerHeight + padding + (i + 1) * lineHeight - 4}
            fontSize={11}
            fontFamily="JetBrains Mono, monospace"
            fill="var(--text)"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <tspan fill="var(--good)">{k}</tspan>: {renderValue(v)}
          </text>
        ))}
      {!isCollapsed && bindings.length === 0 && (
        <text
          x={10}
          y={headerHeight + padding + lineHeight - 4}
          fontSize={10}
          fontFamily="JetBrains Mono, monospace"
          fill="var(--muted)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          (no bindings)
        </text>
      )}
    </g>
  );
}
