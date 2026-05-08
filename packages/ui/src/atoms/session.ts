import { atom, withLocalStorage } from '@reatom/core';
import { STORAGE_VERSION, persistKey } from '../types';
import type { NodePositions, Pos } from '../types';

// User code in the editor.
export const codeAtom = atom('', 'codeAtom').extend(
  withLocalStorage({
    key: persistKey('code'),
    version: STORAGE_VERSION,
  }),
);

// Drill-in stepping toggle.
export const drillInAtom = atom(false, 'drillInAtom').extend(
  withLocalStorage({
    key: persistKey('drillIn'),
    version: STORAGE_VERSION,
  }),
);

// Scrubber playback speed multiplier (1, 2, 4, …).
export const scrubberSpeedAtom = atom(1, 'scrubberSpeedAtom').extend(
  withLocalStorage({
    key: persistKey('scrubberSpeed'),
    version: STORAGE_VERSION,
  }),
);

// Node positions on the canvas. Keyed by "frame-{index}" for stack frames or
// heap object id (e.g. "obj7"). Persisted so reload restores the last layout.
export const nodePositionsAtom = atom<NodePositions>(
  new Map<string, Pos>(),
  'nodePositionsAtom',
).extend(
  withLocalStorage({
    key: persistKey('nodePositions'),
    version: STORAGE_VERSION,
    toSnapshot: (m: NodePositions): Array<[string, Pos]> => Array.from(m.entries()),
    fromSnapshot: (entries: Array<[string, Pos]>): NodePositions => {
      if (!Array.isArray(entries)) return new Map<string, Pos>();
      return new Map(entries);
    },
  }),
);

// Collapsed nodes on the canvas.
export const collapsedIdsAtom = atom<Set<string>>(new Set<string>(), 'collapsedIdsAtom').extend(
  withLocalStorage({
    key: persistKey('collapsedIds'),
    version: STORAGE_VERSION,
    toSnapshot: (s: Set<string>): string[] => Array.from(s),
    fromSnapshot: (arr: string[]): Set<string> => {
      if (!Array.isArray(arr)) return new Set<string>();
      return new Set(arr);
    },
  }),
);

// Editor pane width as a percentage of the grid (10..80). Persisted across reloads.
export const editorWidthAtom = atom(50, 'editorWidthAtom').extend(
  withLocalStorage({
    key: persistKey('editorWidth'),
    version: STORAGE_VERSION,
  }),
);
