import { useAtom, useFrame } from '@reatom/react';
import { collapsedIdsAtom } from '../atoms/session';
import { dragStateAtom } from '../atoms/canvas';
import { useDrag } from '../canvas/useDrag';
import type { HeapObject, JSValue, Pos } from '../types';

const NODE_W = 240;

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

export function HeapNode(props: { id: string; obj: HeapObject; pos: Pos }) {
  const { id, obj, pos } = props;
  const [collapsed] = useAtom(collapsedIdsAtom);
  const [drag] = useAtom(dragStateAtom);
  const reatomFrame = useFrame();

  const renderPos = drag.active && drag.id === id ? drag.pos : pos;
  const isCollapsed = collapsed.has(id);
  const drager = useDrag(id, renderPos);

  const onToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    reatomFrame.run(() => {
      const next = new Set(collapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      collapsedIdsAtom.set(next);
    });
  };

  const labelColor =
    obj.kind === 'function'
      ? 'var(--info)'
      : obj.kind === 'array'
        ? 'var(--accent)'
        : 'var(--good)';

  const headerHeight = 22;
  const lineHeight = 16;
  const padding = 6;
  const props_ = isCollapsed ? [] : Array.from(obj.ownProps.entries());
  const height =
    headerHeight + (isCollapsed ? 0 : padding + Math.max(1, props_.length) * lineHeight + padding);

  return (
    <g transform={`translate(${renderPos.x}, ${renderPos.y})`}>
      <rect
        width={NODE_W}
        height={height}
        rx={6}
        fill="var(--panel)"
        stroke="var(--border)"
        strokeWidth={1}
      />
      <rect
        width={NODE_W}
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
        fill={labelColor}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {obj.kind} #{id}
        {obj.source?.name ? `  ƒ ${obj.source.name}` : ''}
      </text>
      <text
        x={NODE_W - 8}
        y={15}
        fontSize={9}
        textAnchor="end"
        fill="var(--muted)"
        onClick={onToggle}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {isCollapsed ? '▸' : '▾'}
      </text>
      {!isCollapsed &&
        props_.map(([k, v], i) => (
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
      {!isCollapsed && props_.length === 0 && (
        <text
          x={10}
          y={headerHeight + padding + lineHeight - 4}
          fontSize={10}
          fontFamily="JetBrains Mono, monospace"
          fill="var(--muted)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          (no own props)
        </text>
      )}
    </g>
  );
}
