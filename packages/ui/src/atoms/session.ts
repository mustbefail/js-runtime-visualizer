import { atom, withLocalStorage } from '@reatom/core';
import { STORAGE_VERSION, persistKey } from '../types';

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
