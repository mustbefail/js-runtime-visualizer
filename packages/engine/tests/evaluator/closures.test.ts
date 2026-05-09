import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — closures', () => {
  it('closes over an outer variable across calls', () => {
    const { finalValue } = runCode(`
      function makeCounter() {
        let n = 0;
        return function () { n = n + 1; return n; };
      }
      const inc = makeCounter();
      inc();
      inc();
      inc();
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 3 });
  });

  it('keeps independent state per closure', () => {
    const { finalValue } = runCode(`
      function makeCounter() { let n = 0; return () => ++n; }
      const a = makeCounter();
      const b = makeCounter();
      a(); a();
      b();
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });

  it('function HeapObject capturedBindings tracks live closure values across steps', () => {
    const { snapshots } = runCode(`
      let n = 0;
      const f = function () { return n; };
      n = 999;
    `);
    const last = snapshots[snapshots.length - 1]!;
    const fnEntry = Array.from(last.heap.values()).find(
      (o) => o.kind === 'function' && o.source && !o.native,
    );
    expect(fnEntry).toBeDefined();
    const captured = fnEntry?.source?.capturedBindings;
    expect(captured?.get('n')).toEqual({ kind: 'number', value: 999 });
  });

  it('makeCounter — captured n in returned tick advances with each call', () => {
    const { snapshots } = runCode(`
      function makeCounter() {
        let n = 0;
        return function tick() { return ++n; };
      }
      const counter = makeCounter();
      counter();
      counter();
    `);
    const last = snapshots[snapshots.length - 1]!;
    const tick = Array.from(last.heap.values()).find(
      (o) => o.kind === 'function' && o.source?.name === 'tick',
    );
    expect(tick?.source?.capturedBindings?.get('n')).toEqual({ kind: 'number', value: 2 });
  });

  it('[[Environment]] view contains only free variables, not unrelated outer bindings', () => {
    const { snapshots } = runCode(`
      function makeCounter() {
        let n = 0;
        let unused = 999;
        return function tick() { return ++n; };
      }
      const counter = makeCounter();
      counter();
    `);
    const last = snapshots[snapshots.length - 1]!;
    const tick = Array.from(last.heap.values()).find(
      (o) => o.kind === 'function' && o.source?.name === 'tick',
    );
    const captured = tick?.source?.capturedBindings;
    expect(captured?.has('n')).toBe(true);
    expect(captured?.has('unused')).toBe(false);
    expect(captured?.has('console')).toBe(false);
    expect(captured?.has('Object')).toBe(false);
    expect(captured?.has('makeCounter')).toBe(false);
    expect(captured?.has('counter')).toBe(false);
  });
});
