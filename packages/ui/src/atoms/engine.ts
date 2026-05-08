import { atom } from '@reatom/core';
import type { JSValue, Snapshot } from '../types';

export const snapshotsAtom = atom<Snapshot[]>([], 'snapshotsAtom');
export const finalValueAtom = atom<JSValue | null>(null, 'finalValueAtom');
export const runErrorAtom = atom<string | null>(null, 'runErrorAtom');
