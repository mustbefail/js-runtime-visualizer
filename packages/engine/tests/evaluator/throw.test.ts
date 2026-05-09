import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — throw (uncaught)', () => {
  it('throw bubbles out of runCode for uncaught errors', () => {
    expect(() => runCode('throw "boom";')).toThrow(/boom/);
  });
  it('throw bubbles up the call stack when not caught', () => {
    expect(() =>
      runCode(`
        function inner() { throw "from inner"; }
        function outer() { inner(); }
        outer();
      `),
    ).toThrow(/from inner/i);
  });
});
