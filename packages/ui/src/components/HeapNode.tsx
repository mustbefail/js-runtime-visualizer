import { useAtom, useFrame } from '@reatom/react';
import { collapsedIdsAtom } from '../atoms/session';
import { dragStateAtom } from '../atoms/canvas';
import { useDrag } from '../canvas/useDrag';
import type { HeapObject, JSValue, Pos } from '../types';

const NODE_W = 300;

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

export function HeapNode(props: {
  id: string;
  obj: HeapObject;
  pos: Pos;
  heap: Map<string, HeapObject>;
}) {
  const { id, obj, pos, heap } = props;
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

  // Compute a friendly primary label.
  let primaryLabel: string;
  if (obj.kind === 'function') {
    const name = obj.source?.name;
    primaryLabel = name ? `ƒ ${name}` : 'ƒ <anon>';
  } else if (obj.kind === 'array') {
    primaryLabel = 'array';
  } else {
    // Plain object — try to detect Foo.prototype via the constructor own-prop.
    const ctor = obj.ownProps.get('constructor');
    if (ctor && ctor.kind === 'ref') {
      const ctorObj = heap.get(ctor.id);
      const ctorName = ctorObj?.source?.name;
      if (ctorName) {
        primaryLabel = `${ctorName}.prototype`;
      } else {
        primaryLabel = 'object';
      }
    } else {
      primaryLabel = 'object';
    }
  }

  const headerHeight = 28;
  const lineHeight = 20;
  const padding = 8;

  function isAutoProtoConstructorBack(): boolean {
    if (obj.kind !== 'object') return false;
    const ctor = obj.ownProps.get('constructor');
    if (!ctor || ctor.kind !== 'ref') return false;
    const ctorObj = heap.get(ctor.id);
    if (!ctorObj || ctorObj.kind !== 'function') return false;
    const ctorProto = ctorObj.ownProps.get('prototype');
    if (!ctorProto || ctorProto.kind !== 'ref') return false;
    return ctorProto.id === id;
  }
  const isAutoProto = isAutoProtoConstructorBack();

  const props_ = isCollapsed
    ? []
    : Array.from(obj.ownProps.entries()).filter(
        ([k]) => !(isAutoProto && k === 'constructor'),
      );
  const capturedCount =
    obj.kind === 'function' && obj.source?.capturedBindings && !isCollapsed
      ? obj.source.capturedBindings.size
      : 0;
  const propRows = Math.max(1, props_.length);
  const height =
    headerHeight +
    (isCollapsed
      ? 0
      : padding +
        propRows * lineHeight +
        (capturedCount > 0 ? (capturedCount + 1) * lineHeight + 4 : 0) +
        padding);

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
        y={19}
        fontSize={14}
        fontFamily="JetBrains Mono, monospace"
        fill={labelColor}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {primaryLabel}
        <tspan fill="var(--muted)" fontSize={11}>
          {' '}
          #{id}
        </tspan>
      </text>
      <text
        x={NODE_W - 8}
        y={19}
        fontSize={11}
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
            fontSize={13}
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
          fontSize={12}
          fontFamily="JetBrains Mono, monospace"
          fill="var(--muted)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          (no own props)
        </text>
      )}
      {!isCollapsed &&
        obj.kind === 'function' &&
        obj.source?.capturedBindings &&
        obj.source.capturedBindings.size > 0 && (
          <>
            <text
              x={10}
              y={headerHeight + padding + (Math.max(1, props_.length) + 1) * lineHeight - 4}
              fontSize={12}
              fontFamily="JetBrains Mono, monospace"
              fill="var(--accent2)"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              [[Environment]]
            </text>
            {Array.from(obj.source.capturedBindings.entries()).map(([k, v], i) => (
              <text
                key={`env-${k}`}
                x={20}
                y={headerHeight + padding + (Math.max(1, props_.length) + 2 + i) * lineHeight - 4}
                fontSize={13}
                fontFamily="JetBrains Mono, monospace"
                fill="var(--text)"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <tspan fill="var(--accent2)">{k}</tspan>: {renderValue(v)}
              </text>
            ))}
          </>
        )}
    </g>
  );
}
