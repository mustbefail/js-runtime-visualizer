import { type BindingKind, type IEnvironmentRecord, type JSValue, u } from '../types';

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
