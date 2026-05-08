import { type JSValue, type Primitive, num, str, bool, u, nul } from '../types';

export function fromJsLiteral(v: unknown): Primitive {
  if (v === null) return nul();
  if (typeof v === 'undefined') return u();
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string') return str(v);
  if (typeof v === 'boolean') return bool(v);
  throw new Error(`fromJsLiteral: unsupported literal ${String(v)}`);
}

export function toBoolean(v: JSValue): boolean {
  switch (v.kind) {
    case 'undefined':
    case 'null':
      return false;
    case 'boolean':
      return v.value;
    case 'number':
      return v.value !== 0 && !Number.isNaN(v.value);
    case 'string':
      return v.value.length > 0;
    case 'ref':
      return true;
  }
}

export function toNumber(v: JSValue): number {
  switch (v.kind) {
    case 'undefined':
      return Number.NaN;
    case 'null':
      return 0;
    case 'boolean':
      return v.value ? 1 : 0;
    case 'number':
      return v.value;
    case 'string':
      return v.value.trim() === '' ? 0 : Number(v.value);
    case 'ref':
      return Number.NaN;
  }
}

export function isPrimitive(v: JSValue): v is Primitive {
  return v.kind !== 'ref';
}
