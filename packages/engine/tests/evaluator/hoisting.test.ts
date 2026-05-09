import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — hoisting', () => {
  it('function declarations are reachable before they appear in source', () => {
    const { finalValue } = runCode(`
      const r = f();
      function f() { return 42; }
      r;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 42 });
  });
  it('var declarations are reachable before initialisation as undefined', () => {
    const { finalValue } = runCode(`
      const before = x;
      var x = 5;
      before;
    `);
    expect(finalValue).toEqual({ kind: 'undefined' });
  });
  it('hoisting works inside function bodies', () => {
    const { finalValue } = runCode(`
      function outer() {
        const r = inner();
        function inner() { return 'hi'; }
        return r;
      }
      outer();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'hi' });
  });
  it('let and const are NOT hoisted (TDZ)', () => {
    expect(runCode('const r = x; let x = 1;').runtimeError).toBeDefined();
  });
});
