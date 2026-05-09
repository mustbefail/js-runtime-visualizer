import { action } from '@reatom/core';
import { runCode } from '@js-runtime-visualizer/engine';
import { codeAtom, drillInAtom, nodePositionsAtom } from './session';
import { snapshotsAtom, finalValueAtom, runErrorAtom } from './engine';
import { currentStepIndexAtom, isPlayingAtom } from './ui';
import { panZoomAtom } from './canvas';

export const runAction = action(() => {
  const code = codeAtom();
  const drillIn = drillInAtom();
  try {
    const result = runCode(code, { drillIn });
    snapshotsAtom.set(result.snapshots);
    finalValueAtom.set(result.finalValue);
    runErrorAtom.set(result.runtimeError ? result.runtimeError.message : null);
    currentStepIndexAtom.set(0);
    isPlayingAtom.set(false);
    panZoomAtom.set({ panX: 0, panY: 0, scale: 1 });
  } catch (e) {
    runErrorAtom.set(e instanceof Error ? e.message : String(e));
    snapshotsAtom.set([]);
    finalValueAtom.set(null);
    currentStepIndexAtom.set(0);
    isPlayingAtom.set(false);
    panZoomAtom.set({ panX: 0, panY: 0, scale: 1 });
  }
}, 'runAction');

export const resetAction = action(() => {
  snapshotsAtom.set([]);
  finalValueAtom.set(null);
  runErrorAtom.set(null);
  currentStepIndexAtom.set(0);
  isPlayingAtom.set(false);
  panZoomAtom.set({ panX: 0, panY: 0, scale: 1 });
}, 'resetAction');

export const autoArrangeAction = action(() => {
  // Clearing nodePositions makes defaultLayout recompute every node fresh.
  nodePositionsAtom.set(new Map());
  panZoomAtom.set({ panX: 0, panY: 0, scale: 1 });
}, 'autoArrangeAction');
