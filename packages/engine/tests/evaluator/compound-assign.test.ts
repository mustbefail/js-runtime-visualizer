import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — compound assignment', () => {
  it('+= adds to numeric binding', () => {
    expect(runCode('let x = 1; x += 4; x;').finalValue).toEqual({ kind: 'number', value: 5 });
  });
  it('-=, *=, /=, %= work like += pattern', () => {
    expect(runCode('let x = 10; x -= 3; x;').finalValue).toEqual({ kind: 'number', value: 7 });
    expect(runCode('let x = 4; x *= 3; x;').finalValue).toEqual({ kind: 'number', value: 12 });
    expect(runCode('let x = 10; x /= 4; x;').finalValue).toEqual({ kind: 'number', value: 2.5 });
    expect(runCode('let x = 10; x %= 3; x;').finalValue).toEqual({ kind: 'number', value: 1 });
  });
  it('&&=, ||=, ??= follow logical short-circuit semantics', () => {
    expect(runCode('let x = 0; x ||= 7; x;').finalValue).toEqual({ kind: 'number', value: 7 });
    expect(runCode('let x = 5; x ||= 9; x;').finalValue).toEqual({ kind: 'number', value: 5 });
    expect(runCode('let x = null; x ??= 4; x;').finalValue).toEqual({ kind: 'number', value: 4 });
    expect(runCode('let x = 0; x ??= 4; x;').finalValue).toEqual({ kind: 'number', value: 0 });
  });
  it('+= concatenates strings', () => {
    expect(runCode('let s = "a"; s += "b"; s;').finalValue).toEqual({ kind: 'string', value: 'ab' });
  });
});
