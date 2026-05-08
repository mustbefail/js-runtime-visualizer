import { useCallback } from 'react';
import { useAtom, useFrame } from '@reatom/react';
import { panZoomAtom } from '../atoms/canvas';

const SCALE_MIN = 0.25;
const SCALE_MAX = 3;

export function usePanZoom() {
  const [pz] = useAtom(panZoomAtom);
  const frame = useFrame();

  const onMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Only start a pan when the mousedown target is the SVG itself —
      // node drags stopPropagation in their own onMouseDown.
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      const startMouse = { x: e.clientX, y: e.clientY };
      const startPan = { panX: pz.panX, panY: pz.panY };

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouse.x;
        const dy = ev.clientY - startMouse.y;
        frame.run(() =>
          panZoomAtom.set((prev) => ({
            ...prev,
            panX: startPan.panX + dx,
            panY: startPan.panY + dy,
          })),
        );
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [pz.panX, pz.panY, frame],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      frame.run(() =>
        panZoomAtom.set((prev) => {
          const nextScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, prev.scale * (1 + delta)));
          // Anchor the zoom at the cursor.
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const ratio = nextScale / prev.scale;
          return {
            scale: nextScale,
            panX: mx - (mx - prev.panX) * ratio,
            panY: my - (my - prev.panY) * ratio,
          };
        }),
      );
    },
    [frame],
  );

  return { onMouseDown, onWheel };
}
