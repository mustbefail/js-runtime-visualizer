import { type BindingKind, type IEnvironmentRecord, type JSValue, u } from '../types';

// Walks a function's closure environment (and its outers) to produce a flat
// view of all bindings reachable from inside the function body. Used by the
// heap-snapshot pass to render the [[Environment]] block live at each step.
export function walkClosureBindings(env: IEnvironmentRecord): Map<string, JSValue> {
  const out = new Map<string, JSValue>();
  let cur: IEnvironmentRecord | null = env;
  while (cur) {
    for (const [k, v] of cur.snapshotBindings()) {
      if (!out.has(k)) out.set(k, v);
    }
    cur = cur.outer;
  }
  return out;
}

export function jsValueEqual(a: JSValue, b: JSValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'undefined':
    case 'null':
      return true;
    case 'boolean':
    case 'number':
    case 'string':
      return (a as { value: unknown }).value === (b as { value: unknown }).value;
    case 'ref':
      return a.id === (b as { id: string }).id;
  }
}

export function bindingsEqual(a: Map<string, JSValue>, b: Map<string, JSValue>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const bv = b.get(k);
    if (!bv) return false;
    if (!jsValueEqual(v, bv)) return false;
  }
  return true;
}

type Binding = { value: JSValue; kind: BindingKind };

export class EnvironmentRecord implements IEnvironmentRecord {
  private bindings = new Map<string, Binding>();
  constructor(public outer: IEnvironmentRecord | null) {}

  define(name: string, value: JSValue, kind: BindingKind): void {
    if (this.bindings.has(name)) {
      throw new Error(`SyntaxError: '${name}' has already been declared`);
    }
    this.bindings.set(name, { value, kind });
  }

  lookup(name: string): JSValue {
    const here = this.bindings.get(name);
    if (here) return here.value;
    if (this.outer) return this.outer.lookup(name);
    return u();
  }

  has(name: string): boolean {
    if (this.bindings.has(name)) return true;
    return this.outer ? this.outer.has(name) : false;
  }

  assign(name: string, value: JSValue): void {
    const here = this.bindings.get(name);
    if (here) {
      if (here.kind === 'const') {
        throw new Error(`TypeError: Assignment to constant variable '${name}'`);
      }
      here.value = value;
      return;
    }
    if (this.outer) {
      this.outer.assign(name, value);
      return;
    }
    throw new Error(`ReferenceError: ${name} is not defined`);
  }

  // Snapshot a shallow copy of bindings for time-travel rendering.
  snapshotBindings(): Map<string, JSValue> {
    const out = new Map<string, JSValue>();
    for (const [k, v] of this.bindings) out.set(k, v.value);
    return out;
  }
}
