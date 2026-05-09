import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — throw (uncaught)', () => {
  it('uncaught throw returns runtimeError instead of escaping runCode', () => {
    const result = runCode('throw "boom";');
    expect(result.runtimeError?.message).toMatch(/boom/);
    expect(result.snapshots.length).toBeGreaterThan(0);
  });

  it('uncaught throw through nested calls — snapshots preserved, runtimeError set', () => {
    const result = runCode(`
      function inner() { throw "from inner"; }
      function outer() { inner(); }
      outer();
    `);
    expect(result.runtimeError?.message).toMatch(/from inner/i);
    const kinds = result.snapshots.map((s) => s.eventKind);
    expect(kinds).toContain('error');
    expect(kinds.filter((k) => k === 'unwind-frame').length).toBeGreaterThanOrEqual(2);
  });

  it('caught throw — emits unwind-frame for each popped frame and a catch event', () => {
    const result = runCode(`
      function inner() { throw 'boom'; }
      function outer() { inner(); }
      try { outer(); } catch (e) {}
    `);
    expect(result.runtimeError).toBeUndefined();
    const kinds = result.snapshots.map((s) => s.eventKind);
    expect(kinds.filter((k) => k === 'unwind-frame').length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain('catch');
  });

  it('throw new Error("msg") — Error builtin works, instance carries message', () => {
    const result = runCode(`
      function tick() { throw new Error("N more than two"); }
      tick();
    `);
    expect(result.runtimeError?.message).toMatch(/N more than two/);
    const errSnap = result.snapshots.find((s) => s.eventKind === 'error');
    expect(errSnap?.errorMessage).toMatch(/N more than two/);
  });

  it('Reference to undefined identifier yields a runtimeError with snapshots intact', () => {
    const result = runCode(`
      function f() { return notDefined; }
      f();
    `);
    expect(result.runtimeError?.message).toMatch(/notDefined/);
    expect(result.snapshots.length).toBeGreaterThan(0);
  });
});
