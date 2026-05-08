import type { PanZoom, Pos } from '../types';

// Convert a screen-space mouse delta (dx, dy) to canvas-space delta by
// dividing by the current zoom.
export function screenDeltaToCanvas(dx: number, dy: number, pz: PanZoom): Pos {
  return { x: dx / pz.scale, y: dy / pz.scale };
}

// Convert a screen position (clientX/clientY relative to the SVG element)
// into canvas-space coordinates by undoing pan + zoom.
export function screenToCanvas(screen: Pos, pz: PanZoom): Pos {
  return {
    x: (screen.x - pz.panX) / pz.scale,
    y: (screen.y - pz.panY) / pz.scale,
  };
}
