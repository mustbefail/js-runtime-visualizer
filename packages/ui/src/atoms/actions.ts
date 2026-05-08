import { action } from '@reatom/core';
import { runCode } from '@js-runtime-visualizer/engine';
import { codeAtom, drillInAtom } from './session';
import { snapshotsAtom, finalValueAtom, runErrorAtom } from './engine';

export const runAction = action(() => {
  const code = codeAtom();
  const drillIn = drillInAtom();
  try {
    const { snapshots, finalValue } = runCode(code, { drillIn });
    snapshotsAtom.set(snapshots);
    finalValueAtom.set(finalValue);
    runErrorAtom.set(null);
  } catch (e) {
    runErrorAtom.set(e instanceof Error ? e.message : String(e));
    snapshotsAtom.set([]);
    finalValueAtom.set(null);
  }
}, 'runAction');

export const resetAction = action(() => {
  snapshotsAtom.set([]);
  finalValueAtom.set(null);
  runErrorAtom.set(null);
}, 'resetAction');
