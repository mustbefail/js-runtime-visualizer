import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — literals and arithmetic', () => {
  it('evaluates a numeric literal expression', () => {
    const { snapshots, finalValue } = runCode('1;');
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it('evaluates a string literal', () => {
    const { finalValue } = runCode('"hello";');
    expect(finalValue).toEqual({ kind: 'string', value: 'hello' });
  });

  it('evaluates boolean literals', () => {
    expect(runCode('true;').finalValue).toEqual({ kind: 'boolean', value: true });
    expect(runCode('false;').finalValue).toEqual({ kind: 'boolean', value: false });
  });

  it('evaluates null and undefined', () => {
    expect(runCode('null;').finalValue).toEqual({ kind: 'null' });
    expect(runCode('undefined;').finalValue).toEqual({ kind: 'undefined' });
  });

  it('evaluates binary arithmetic', () => {
    expect(runCode('1 + 2;').finalValue).toEqual({ kind: 'number', value: 3 });
    expect(runCode('10 - 4;').finalValue).toEqual({ kind: 'number', value: 6 });
    expect(runCode('3 * 4;').finalValue).toEqual({ kind: 'number', value: 12 });
    expect(runCode('20 / 5;').finalValue).toEqual({ kind: 'number', value: 4 });
  });

  it('respects operator precedence', () => {
    expect(runCode('1 + 2 * 3;').finalValue).toEqual({ kind: 'number', value: 7 });
  });

  it('supports unary minus and not', () => {
    expect(runCode('-5;').finalValue).toEqual({ kind: 'number', value: -5 });
    expect(runCode('!true;').finalValue).toEqual({ kind: 'boolean', value: false });
  });
});
