import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — objects and arrays', () => {
  it('creates an object literal and reads a property', () => {
    const { finalValue } = runCode('const o = { x: 1, y: 2 }; o.x;');
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });

  it('reads property via computed access', () => {
    const { finalValue } = runCode('const o = { a: 10 }; o["a"];');
    expect(finalValue).toEqual({ kind: 'number', value: 10 });
  });

  it('mutates an own property', () => {
    const { finalValue } = runCode('const o = { x: 1 }; o.x = 5; o.x;');
    expect(finalValue).toEqual({ kind: 'number', value: 5 });
  });

  it('creates and reads from arrays', () => {
    const { finalValue } = runCode('const a = [10, 20, 30]; a[1];');
    expect(finalValue).toEqual({ kind: 'number', value: 20 });
  });

  it('returns undefined for missing property (own only — no prototype walk in plan 1)', () => {
    const { finalValue } = runCode('const o = {}; o.missing;');
    expect(finalValue).toEqual({ kind: 'undefined' });
  });
});
