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

  it('emits unwind-frame for each frame popped during an uncaught throw', () => {
    const result = runCode(`
      function inner() { throw 'boom'; }
      function outer() { inner(); }
      try { outer(); } catch (e) {}
    `);
    const kinds = result.snapshots.map((s) => s.eventKind);
    expect(kinds.filter((k) => k === 'unwind-frame').length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain('catch');
  });
});
