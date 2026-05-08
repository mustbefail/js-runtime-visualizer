import { useCallback } from 'react';
import { useAtom, useFrame } from '@reatom/react';
import { panZoomAtom, dragStateAtom } from '../atoms/canvas';
import { nodePositionsAtom } from '../atoms/session';
import type { Pos } from '../types';
import { screenDeltaToCanvas } from './coords';

// Returns an onMouseDown handler that initiates a node drag. The handler
// captures starting mouse + position, then attaches window-level listeners
// for move and up. During move, dragStateAtom is updated. On up, the final
// position is written to nodePositionsAtom.
export function useDrag(
  id: string,
  currentPos: Pos,
): {
  onMouseDown: (e: React.MouseEvent) => void;
} {
  const [pz] = useAtom(panZoomAtom);
  const frame = useFrame();

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't let a node drag also pan the canvas.
      e.stopPropagation();
      e.preventDefault();
      const startMouse = { x: e.clientX, y: e.clientY };
      const startPos = currentPos;

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouse.x;
        const dy = ev.clientY - startMouse.y;
        const delta = screenDeltaToCanvas(dx, dy, pz);
        const next: Pos = { x: startPos.x + delta.x, y: startPos.y + delta.y };
        frame.run(() => dragStateAtom.set({ active: true, id, pos: next }));
      };

      const onUp = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouse.x;
        const dy = ev.clientY - startMouse.y;
        const delta = screenDeltaToCanvas(dx, dy, pz);
        const finalPos: Pos = { x: startPos.x + delta.x, y: startPos.y + delta.y };
        frame.run(() => {
          // Commit to persisted atom.
          const map = new Map(nodePositionsAtom());
          map.set(id, finalPos);
          nodePositionsAtom.set(map);
          // Clear transient drag state.
          dragStateAtom.set({ active: false });
        });
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [id, currentPos, pz, frame],
  );

  return { onMouseDown };
}
