import { describe, it, expect } from 'vitest';
import { runCode } from '../src/index';

describe('engine integration — closure example from spec', () => {
  const code = `
    function makeCounter() {
      let count = 0;
      const items = [];
      return function counter() {
        count = count + 1;
        items[count - 1] = count;
        return count;
      };
    }
    const inc = makeCounter();
    inc();
    inc();
  `;

  it('returns 2 from the second call', () => {
    const { finalValue } = runCode(code);
    expect(finalValue).toEqual({ kind: 'number', value: 2 });
  });

  it('keeps closure scope alive across calls', () => {
    const { snapshots } = runCode(code);
    const last = snapshots[snapshots.length - 1];
    // The global frame should hold inc → ref to a function whose closure refers to a still-existing scope
    const globalFrame = last?.callStack[0];
    const incBinding = globalFrame?.bindings.get('inc');
    expect(incBinding?.kind).toBe('ref');
  });

  it('produces a non-empty snapshot stream of varied event kinds', () => {
    const { snapshots } = runCode(code);
    const kinds = new Set(snapshots.map((s) => s.eventKind));
    for (const k of ['enter-frame', 'leave-frame', 'allocate', 'assign', 'lookup']) {
      expect(kinds.has(k as never)).toBe(true);
    }
  });
});

describe('engine integration — runs the full sync subset without crash', () => {
  it('handles a mixed-feature program', () => {
    const code = `
      const items = [1, 2, 3, 4];
      let sum = 0;
      for (let i = 0; i < items.length; i = i + 1) {
        sum = sum + items[i];
      }
      const obj = { sum };
      console.log(obj.sum);
      sum;
    `;
    const { finalValue, snapshots } = runCode(code);
    expect(finalValue).toEqual({ kind: 'number', value: 10 });
    const last = snapshots[snapshots.length - 1];
    expect(last?.consoleOut).toEqual(['10']);
  });
});
