import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — drill-in stepping', () => {
  it('produces more snapshots with drillIn=true for arithmetic expressions', () => {
    const code = 'let x = 1 + 2 * 3;';
    const off = runCode(code, { drillIn: false }).snapshots.length;
    const on = runCode(code, { drillIn: true }).snapshots.length;
    expect(on).toBeGreaterThan(off);
  });

  it('still computes the same final value with drillIn enabled', () => {
    expect(runCode('1 + 2 * 3;', { drillIn: true }).finalValue).toEqual({
      kind: 'number',
      value: 7,
    });
  });
});
