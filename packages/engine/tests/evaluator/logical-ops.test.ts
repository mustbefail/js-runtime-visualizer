import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — logical operators', () => {
  it('&& returns left when left is falsy', () => {
    expect(runCode('0 && 1;').finalValue).toEqual({ kind: 'number', value: 0 });
    expect(runCode('"" && "x";').finalValue).toEqual({ kind: 'string', value: '' });
  });
  it('&& returns right when left is truthy', () => {
    expect(runCode('1 && 2;').finalValue).toEqual({ kind: 'number', value: 2 });
  });
  it('|| returns left when left is truthy', () => {
    expect(runCode('1 || 2;').finalValue).toEqual({ kind: 'number', value: 1 });
  });
  it('|| returns right when left is falsy', () => {
    expect(runCode('0 || 5;').finalValue).toEqual({ kind: 'number', value: 5 });
    expect(runCode('null || "x";').finalValue).toEqual({ kind: 'string', value: 'x' });
  });
  it('?? returns right only for null or undefined left', () => {
    expect(runCode('0 ?? 5;').finalValue).toEqual({ kind: 'number', value: 0 });
    expect(runCode('"" ?? "x";').finalValue).toEqual({ kind: 'string', value: '' });
    expect(runCode('null ?? "x";').finalValue).toEqual({ kind: 'string', value: 'x' });
    expect(runCode('undefined ?? 7;').finalValue).toEqual({ kind: 'number', value: 7 });
  });
  it('short-circuits — right operand never evaluated when left decides', () => {
    expect(runCode('1 && 2 || nope;').finalValue).toEqual({ kind: 'number', value: 2 });
  });
});
