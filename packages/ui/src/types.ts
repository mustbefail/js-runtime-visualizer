import type { Snapshot, JSValue } from '@js-runtime-visualizer/engine';

// Re-export engine types that UI components consume so components import
// everything from one `../types` location, in line with the project's
// central-types convention.
export type { Snapshot, JSValue };
export type {
  EventKind,
  StepEvent,
  FrameSnapshot,
  SnapshotHighlights,
  HeapObject,
  Reference,
  Primitive,
  SourceLoc,
} from '@js-runtime-visualizer/engine';

// UI-only types

export type RunStatus =
  | { kind: 'idle' }
  | { kind: 'ok'; snapshots: Snapshot[]; finalValue: JSValue }
  | { kind: 'error'; message: string };

// Persistence-key prefix used by all withLocalStorage atoms in this app.
// Bumping STORAGE_VERSION clears all old keys via Reatom's `version` option.
export const STORAGE_PREFIX = 'jsrv';
export const STORAGE_VERSION = 1;

export const persistKey = (slot: string): string => `${STORAGE_PREFIX}:${slot}`;
