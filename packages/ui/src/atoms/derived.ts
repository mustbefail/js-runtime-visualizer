import { computed } from '@reatom/core';
import type { Snapshot } from '../types';
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
