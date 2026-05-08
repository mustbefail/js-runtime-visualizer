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
});
