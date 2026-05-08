import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — conditional expression', () => {
  it('returns the consequent for truthy test', () => {
    expect(runCode('true ? 1 : 2;').finalValue).toEqual({ kind: 'number', value: 1 });
  });
  it('returns the alternate for falsy test', () => {
    expect(runCode('0 ? 1 : 2;').finalValue).toEqual({ kind: 'number', value: 2 });
  });
  it('does not evaluate the unchosen branch', () => {
    expect(runCode('true ? 5 : nope;').finalValue).toEqual({ kind: 'number', value: 5 });
  });
});
