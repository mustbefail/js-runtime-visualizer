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

  it('function HeapObject snapshots its capturedBindings at allocation time', () => {
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
    expect(captured?.get('n')).toEqual({ kind: 'number', value: 0 });
  });
});
