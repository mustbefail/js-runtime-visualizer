import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — try/finally', () => {
  it('finally runs after a normal try completion', () => {
    const { finalValue } = runCode(`
      let log = '';
      try { log += 'try;'; } finally { log += 'fin;'; }
      log;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'try;fin;' });
  });
  it('finally runs after an uncaught throw and the throw still propagates', () => {
    expect(
      runCode(`
        let log = '';
        try {
          try { throw 'boom'; } finally { log += 'fin;'; }
        } catch (e) {
          if (log !== 'fin;') throw 'finally did not run';
          throw e;
        }
      `).runtimeError?.message,
    ).toMatch(/boom/);
  });
  it('finally runs after a return from the try body', () => {
    const { finalValue } = runCode(`
      let log = '';
      function f() {
        try { return 'ret'; } finally { log += 'fin;'; }
      }
      const r = f();
      log + r;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'fin;ret' });
  });
  it('try/catch/finally runs all three on a thrown error', () => {
    const { finalValue } = runCode(`
      let log = '';
      try { throw 'x'; } catch (e) { log += 'cat:' + e + ';'; } finally { log += 'fin;'; }
      log;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'cat:x;fin;' });
  });
});
