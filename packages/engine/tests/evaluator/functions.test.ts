import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — functions', () => {
  it('declares and calls a function', () => {
    const { finalValue } = runCode(`
      function add(a, b) { return a + b; }
      add(2, 3);
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 5 });
  });

  it('returns undefined when no return statement is reached', () => {
    const { finalValue } = runCode('function f() {} f();');
    expect(finalValue).toEqual({ kind: 'undefined' });
  });

  it('supports function expressions assigned to variables', () => {
    const { finalValue } = runCode('const f = function (n) { return n * 2; }; f(7);');
    expect(finalValue).toEqual({ kind: 'number', value: 14 });
  });

  it('supports arrow functions with concise body', () => {
    const { finalValue } = runCode('const sq = (n) => n * n; sq(4);');
    expect(finalValue).toEqual({ kind: 'number', value: 16 });
  });

  it('emits enter-frame and leave-frame events on call', () => {
    const { snapshots } = runCode('function f() { return 1; } f();');
    const kinds = snapshots.map((s) => s.eventKind);
    expect(kinds.filter((k) => k === 'enter-frame')).toHaveLength(2); // global + f
    expect(kinds.filter((k) => k === 'leave-frame')).toHaveLength(1);
  });
});
