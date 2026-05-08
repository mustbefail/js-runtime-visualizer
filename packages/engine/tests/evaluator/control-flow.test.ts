import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — control flow', () => {
  it('takes the then branch', () => {
    const { finalValue } = runCode('let x = 0; if (true) x = 1; else x = 2; x;');
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });

  it('takes the else branch', () => {
    const { finalValue } = runCode('let x = 0; if (false) x = 1; else x = 2; x;');
    expect(finalValue).toEqual({ kind: 'number', value: 2 });
  });

  it('runs while loop until false', () => {
    const { finalValue } = runCode('let i = 0; while (i < 3) i = i + 1; i;');
    expect(finalValue).toEqual({ kind: 'number', value: 3 });
  });

  it('runs for loop with init/test/update', () => {
    const { finalValue } = runCode('let s = 0; for (let i = 1; i <= 3; i = i + 1) s = s + i; s;');
    expect(finalValue).toEqual({ kind: 'number', value: 6 });
  });

  it('introduces a fresh block scope for let inside { }', () => {
    const { finalValue } = runCode('let x = 1; { let x = 2; } x;');
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });
});
