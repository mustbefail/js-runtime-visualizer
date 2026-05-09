import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — try/catch', () => {
  it('catches a thrown value into the binding', () => {
    const { finalValue } = runCode(`
      let r = 'init';
      try { throw 'boom'; } catch (e) { r = e; }
      r;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'boom' });
  });
  it('try body completes normally when no throw', () => {
    const { finalValue } = runCode(`
      let r = 'init';
      try { r = 'try'; } catch (e) { r = 'catch'; }
      r;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'try' });
  });
  it('catch from a nested function call', () => {
    const { finalValue } = runCode(`
      function inner() { throw 42; }
      let r = 0;
      try { inner(); } catch (e) { r = e; }
      r;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 42 });
  });
  it('nested try — inner catch handles before outer', () => {
    const { finalValue } = runCode(`
      let r = 'init';
      try {
        try { throw 'x'; } catch (e) { r = 'inner:' + e; }
      } catch (e) { r = 'outer:' + e; }
      r;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'inner:x' });
  });
  it('emits a catch event when the handler runs', () => {
    const { snapshots } = runCode(`
      try { throw 'boom'; } catch (e) {}
    `);
    const kinds = snapshots.map((s) => s.eventKind);
    expect(kinds).toContain('catch');
  });
});
