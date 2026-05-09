import type { Snapshot, JSValue, SourceLoc } from '@js-runtime-visualizer/engine';

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

// =============================================================================
// Canvas types (plan 3)
// =============================================================================

export type Pos = { x: number; y: number };

export type NodeKind = 'frame' | 'heap';

// A reference edge to render: from a binding inside a frame, or from an own
// property of a heap object, to a heap object id.
export type RefEdge = {
  fromKind: NodeKind;
  fromId: string; // synthetic frame key or heap id
  fromLabel: string; // binding name, property key, or "[[Prototype]]"
  toId: string;
  edgeKind: 'ref' | 'proto'; // ref = solid teal, proto = solid violet
};

// Persistent storage of node positions. Frame ids use synthetic key "frame-{index}".
export type NodePositions = Map<string, Pos>;

// Pan/zoom transient state (not persisted — fresh per session).
export type PanZoom = { panX: number; panY: number; scale: number };

// Drag transient state — null when no node is being dragged.
export type DragState = { active: false } | { active: true; id: string; pos: Pos };

// =============================================================================
// Traceback (plan 5)
// =============================================================================

export type TracebackEntry = {
  fnName: string;
  callSite: SourceLoc | null;
  enterStep: number;
};

export type Traceback = {
  errorStep: number;
  message: string;
  frames: TracebackEntry[];
  caught: boolean;
};
