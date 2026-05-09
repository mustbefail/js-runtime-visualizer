import { computed } from '@reatom/core';
import type { Snapshot, Traceback, TracebackEntry } from '../types';
import { snapshotsAtom } from './engine';
import { currentStepIndexAtom } from './ui';

export const totalStepsAtom = computed(() => snapshotsAtom().length, 'totalStepsAtom');

export const currentSnapshotAtom = computed<Snapshot | null>(() => {
  const snaps = snapshotsAtom();
  const i = currentStepIndexAtom();
  if (snaps.length === 0) return null;
  if (i < 0 || i >= snaps.length) return null;
  return snaps[i] ?? null;
}, 'currentSnapshotAtom');

export const isAtStartAtom = computed(() => currentStepIndexAtom() <= 0, 'isAtStartAtom');

export const isAtEndAtom = computed(() => {
  const total = totalStepsAtom();
  if (total === 0) return true;
  return currentStepIndexAtom() >= total - 1;
}, 'isAtEndAtom');

export const tracebackAtom = computed<Traceback | null>(() => {
  const snaps = snapshotsAtom();
  const i = currentStepIndexAtom();
  if (i < 0 || i >= snaps.length) return null;
  // Walk backwards from the current snapshot looking for the most recent
  // `error` event. If we hit a `catch` first, return null (the error is in
  // the past and was already handled).
  let errorIdx = -1;
  for (let j = i; j >= 0; j--) {
    const s = snaps[j];
    if (!s) continue;
    if (s.eventKind === 'catch') break;
    if (s.eventKind === 'error') {
      errorIdx = j;
      break;
    }
  }
  if (errorIdx === -1) return null;
  const snap = snaps[errorIdx];
  if (!snap) return null;

  const frames: TracebackEntry[] = [...snap.callStack].reverse().map((f) => {
    let enterStep = errorIdx;
    for (let k = errorIdx; k >= 0; k--) {
      const s = snaps[k];
      if (s && s.eventKind === 'enter-frame') {
        const stackAtK = s.callStack;
        if (stackAtK[stackAtK.length - 1]?.fnName === f.fnName) {
          enterStep = k;
          break;
        }
      }
    }
    return {
      fnName: f.fnName,
      callSite: f.callSite,
      enterStep,
    };
  });

  let caught = false;
  for (let k = errorIdx + 1; k < snaps.length; k++) {
    const s = snaps[k];
    if (s?.eventKind === 'catch') {
      caught = true;
      break;
    }
  }

  const message = snap.errorMessage ?? '';
  return { errorStep: errorIdx, message, frames, caught };
}, 'tracebackAtom');
