import { useCallback } from 'react';
import { useAtom, useFrame } from '@reatom/react';
import { editorWidthAtom } from '../atoms/session';

const MIN = 10;
const MAX = 80;

export function Splitter() {
  const frame = useFrame();
  const [width] = useAtom(editorWidthAtom);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const containerWidth = window.innerWidth;
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dxPercent = (dx / containerWidth) * 100;
        const next = Math.max(MIN, Math.min(MAX, startWidth + dxPercent));
        frame.run(() => editorWidthAtom.set(next));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [width, frame],
  );

  return (
    <div
      className="splitter"
      onMouseDown={onMouseDown}
      title="Drag to resize"
    />
  );
}
