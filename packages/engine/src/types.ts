import type { Node as AstNode, Program } from 'acorn';

// =============================================================================
// Primitive values and references
// =============================================================================

export type Primitive =
  | { kind: 'undefined' }
  | { kind: 'null' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string };

export type Reference = { kind: 'ref'; id: string };

export type JSValue = Primitive | Reference;

export type SourceLoc = { line: number; col: number };

// =============================================================================
// Heap and runtime objects
// =============================================================================

export type FunctionSource = {
  name?: string;
  params: string[];
  body: AstNode;
  isArrow: boolean;
  homeObject?: Reference;
  capturedBindings?: Map<string, JSValue>;
};

export type NativeCtx = {
  consoleOut: string[];
};

export type NativeFn = (args: JSValue[], ctx: NativeCtx) => JSValue;

export type HeapObject = {
  kind: 'object' | 'array' | 'function';
  ownProps: Map<string, JSValue>;
  prototype: Reference | null;
  // function-only:
  closure?: IEnvironmentRecord;
  source?: FunctionSource;
  native?: NativeFn;
  builtin?: boolean;
};

export interface IHeap {
  allocate(obj: HeapObject): Reference;
  get(id: string): HeapObject | undefined;
  setProp(id: string, key: string, value: JSValue): void;
  setPrototype(id: string, proto: Reference | null): void;
  size(): number;
  entries(): IterableIterator<[string, HeapObject]>;
  snapshot(): Map<string, HeapObject>;
}

// =============================================================================
// Environment records and frames
// =============================================================================

export type BindingKind = 'let' | 'const' | 'var';

export interface IEnvironmentRecord {
  outer: IEnvironmentRecord | null;
  define(name: string, value: JSValue, kind: BindingKind): void;
  lookup(name: string): JSValue;
  has(name: string): boolean;
  assign(name: string, value: JSValue): void;
  snapshotBindings(): Map<string, JSValue>;
}

export type Frame = {
  fn: Reference | 'global';
  fnName: string;
  env: IEnvironmentRecord;
  callSite: SourceLoc | null;
  thisValue: JSValue;
};

export interface ICallStack {
  push(frame: Frame): void;
  pop(): Frame | undefined;
  top(): Frame | undefined;
  size(): number;
  snapshot(): Frame[];
}

// =============================================================================
// Step events
// =============================================================================

export type EventKind =
  | 'enter-frame'
  | 'leave-frame'
  | 'assign'
  | 'allocate'
  | 'lookup'
  | 'mutate'
  | 'console'
  | 'proto-walk'
  | 'proto-set'
  | 'bind-this';

export type StepEvent = {
  kind: EventKind;
  loc: SourceLoc;
  payload?: Record<string, unknown>;
};

// =============================================================================
// Snapshots
// =============================================================================

export type FrameSnapshot = {
  fnName: string;
  callSite: SourceLoc | null;
  bindings: Map<string, JSValue>;
};

export type SnapshotHighlights = {
  lookupPath?: string[];
  changedIds?: string[];
  activeFrame?: number;
};

export type Snapshot = {
  step: number;
  loc: SourceLoc;
  eventKind: EventKind;
  callStack: FrameSnapshot[];
  heap: Map<string, HeapObject>;
  consoleOut: string[];
  highlights: SnapshotHighlights;
};

export type CaptureInput = {
  eventKind: EventKind;
  loc: SourceLoc;
  heap: IHeap;
  stack: ICallStack;
  consoleOut: string[];
  highlights: SnapshotHighlights;
};

export interface ISnapshotStore {
  capture(input: CaptureInput): void;
  length(): number;
  at(i: number): Snapshot;
  all(): Snapshot[];
}

// =============================================================================
// Parser
// =============================================================================

export type ParseResult =
  | { ok: true; ast: Program }
  | { ok: false; error: { message: string; line: number; col: number } };

// =============================================================================
// Evaluator
// =============================================================================

export type Context = {
  heap: IHeap;
  stack: ICallStack;
  globalEnv: IEnvironmentRecord;
  consoleOut: string[];
  drillIn: boolean;
};

export type RunOptions = { drillIn?: boolean };

export type RunResult = {
  snapshots: Snapshot[];
  finalValue: JSValue;
};

// =============================================================================
// Primitive value constructors (small runtime helpers, kept here so callers
// import value types and constructors from one place)
// =============================================================================

export const u = (): Primitive => ({ kind: 'undefined' });
export const nul = (): Primitive => ({ kind: 'null' });
export const num = (n: number): Primitive => ({ kind: 'number', value: n });
export const str = (s: string): Primitive => ({ kind: 'string', value: s });
export const bool = (b: boolean): Primitive => ({ kind: 'boolean', value: b });
