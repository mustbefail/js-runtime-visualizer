import { describe, it, expect } from 'vitest';
import { runCode } from '../src/index';
import type { JSValue } from '../src/index';

function toJsValue(v: unknown): JSValue {
  if (v === null) return { kind: 'null' };
  if (typeof v === 'undefined') return { kind: 'undefined' };
  if (typeof v === 'number') return { kind: 'number', value: v };
  if (typeof v === 'string') return { kind: 'string', value: v };
  if (typeof v === 'boolean') return { kind: 'boolean', value: v };
  // Real V8 returned an object — cross-check is intentionally limited to primitives.
  return { kind: 'ref', id: 'real-object' };
}

function realEval(code: string): JSValue {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(`"use strict"; ${code}`);
  return toJsValue(fn());
}

const cases: { name: string; code: string }[] = [
  { name: 'arithmetic precedence', code: 'return 1 + 2 * 3 - 4 / 2;' },
  { name: 'string concat with number', code: 'return "x = " + 1 + 2;' },
  {
    name: 'nested if',
    code: 'let x = 5; if (x > 3) { if (x > 4) return "big"; } return "small";',
  },
  {
    name: 'loop sum',
    code: 'let s = 0; for (let i = 1; i <= 5; i = i + 1) s = s + i; return s;',
  },
  {
    name: 'closure counter',
    code: `
      function mk() { let n = 0; return () => ++n; }
      const c = mk();
      c(); c(); c();
      return c();
    `,
  },
];

describe('cross-check engine vs real V8', () => {
  for (const c of cases) {
    it(c.name, () => {
      const expected = realEval(c.code);
      const wrapped = `(function(){ ${c.code} })();`;
      const ours = runCode(wrapped).finalValue;
      expect(ours).toEqual(expected);
    });
  }
});
