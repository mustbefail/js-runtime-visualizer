import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — variables and assignment', () => {
  it('declares and reads a let binding', () => {
    const { finalValue } = runCode('let x = 7; x;');
    expect(finalValue).toEqual({ kind: 'number', value: 7 });
  });

  it('reassigns a let', () => {
    const { finalValue } = runCode('let x = 1; x = 2; x;');
    expect(finalValue).toEqual({ kind: 'number', value: 2 });
  });

  it('rejects assignment to const', () => {
    expect(() => runCode('const x = 1; x = 2;')).toThrow(/const/i);
  });

  it('emits assign events', () => {
    const { snapshots } = runCode('let x = 1; x = 2;');
    const kinds = snapshots.map((s) => s.eventKind);
    expect(kinds).toContain('assign');
  });

  it('throws ReferenceError for undeclared identifier', () => {
    expect(() => runCode('y;')).toThrow(/y is not defined/i);
  });
});
