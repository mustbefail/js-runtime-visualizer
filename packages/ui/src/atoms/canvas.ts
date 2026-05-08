import { atom } from '@reatom/core';
import type { DragState, PanZoom } from '../types';

// Transient — pan/zoom is fresh per session.
export const panZoomAtom = atom<PanZoom>({ panX: 0, panY: 0, scale: 1 }, 'panZoomAtom');

// Transient — only set during a mouse drag.
export const dragStateAtom = atom<DragState>({ active: false }, 'dragStateAtom');

// Toggle for showing engine-internal host prototypes (Object.prototype etc.) in the canvas.
// Default off so the user sees only their own objects.
export const showBuiltinsAtom = atom(false, 'showBuiltinsAtom');
