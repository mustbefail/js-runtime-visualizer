import { useAtom, useFrame } from '@reatom/react';
import { collapsedIdsAtom } from '../atoms/session';
import { dragStateAtom } from '../atoms/canvas';
import { useDrag } from '../canvas/useDrag';
import {
  frameKey,
  frameOwnHeight,
  nestedFrameWidth,
  NESTED_FRAME_PAD,
} from '../canvas/layout';
import type { FrameSnapshot, JSValue, Pos } from '../types';

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

const HEADER = 28;
const LINE = 20;
const PAD = NESTED_FRAME_PAD;

// Recursive total height of a frame chain starting at `index`.
function totalHeight(
  callStack: FrameSnapshot[],
  collapsedIds: Set<string>,
  index: number,
): number {
  const frame = callStack[index];
  if (!frame) return 0;
  const collapsed = collapsedIds.has(frameKey(index));
  const own = frameOwnHeight(frame.bindings.size, collapsed);
  const hasChild = index + 1 < callStack.length;
  if (!hasChild) return own;
  return own + PAD + totalHeight(callStack, collapsedIds, index + 1);
}

export function FrameNode(props: {
  callStack: FrameSnapshot[];
  index: number;
  level: number;
  pos: Pos;
  isErrorTopFrame: boolean;
}) {
  const { callStack, index, level, pos, isErrorTopFrame } = props;
  const id = frameKey(index);
  const [collapsed] = useAtom(collapsedIdsAtom);
  const [drag] = useAtom(dragStateAtom);
  const reatomFrame = useFrame();

  const frame = callStack[index];
  if (!frame) return null;

  const isTop = index === callStack.length - 1;
  const isError = isErrorTopFrame && isTop;
  const isCollapsed = collapsed.has(id);

  // Only the outer (level 0) frame is draggable. Inner frames inherit position
  // from parent — dragging the root moves everything.
  const renderPos = level === 0 && drag.active && drag.id === id ? drag.pos : pos;
  const drager = useDrag(id, renderPos);
  const draggable = level === 0;

  const onTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    reatomFrame.run(() => {
      const next = new Set(collapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      collapsedIdsAtom.set(next);
    });
  };

  const titleColor = isError
    ? 'var(--bad)'
    : isTop
      ? 'var(--accent)'
      : 'var(--info)';
  const borderColor = isError
    ? 'var(--bad)'
    : isTop
      ? 'var(--accent)'
      : 'var(--border)';
  const strokeWidth = isError || isTop ? 2 : 1;

  const W = nestedFrameWidth(level);
  const ownH = frameOwnHeight(frame.bindings.size, isCollapsed);
  const fullH = totalHeight(callStack, collapsed, index);
  const bindings = isCollapsed ? [] : Array.from(frame.bindings.entries());

  // Position of inner-child frame WITHIN this group's coordinate space.
  const childInnerPos: Pos = { x: PAD, y: ownH };

  return (
    <g
      data-testid="frame-node"
      data-frame-id={id}
      transform={`translate(${renderPos.x}, ${renderPos.y})`}
    >
      <rect
        width={W}
        height={fullH}
        rx={6}
        fill="var(--panel)"
        stroke={borderColor}
        strokeWidth={strokeWidth}
      />
      <rect
        data-testid="frame-header"
        width={W}
        height={HEADER}
        rx={6}
        fill="rgba(0,0,0,0.2)"
        onMouseDown={draggable ? drager.onMouseDown : undefined}
        style={{ cursor: draggable ? 'move' : 'default' }}
      />
      <text
        x={10}
        y={19}
        fontSize={14}
        fontFamily="JetBrains Mono, monospace"
        fill={titleColor}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {isTop ? '▶ ' : ''}
        {frame.fnName}
      </text>
      <text
        x={W - 10}
        y={20}
        fontSize={16}
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
            x={12}
            y={HEADER + PAD + (i + 1) * LINE - 4}
            fontSize={13}
            fontFamily="JetBrains Mono, monospace"
            fill="var(--text)"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <tspan fill="var(--good)">{k}</tspan>: {renderValue(v)}
          </text>
        ))}
      {!isCollapsed && bindings.length === 0 && (
        <text
          x={12}
          y={HEADER + PAD + LINE - 4}
          fontSize={13}
          fontFamily="JetBrains Mono, monospace"
          fill="var(--muted)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          (no bindings)
        </text>
      )}
      {!isCollapsed && index + 1 < callStack.length && (
        <FrameNode
          callStack={callStack}
          index={index + 1}
          level={level + 1}
          pos={childInnerPos}
          isErrorTopFrame={isErrorTopFrame}
        />
      )}
    </g>
  );
}
