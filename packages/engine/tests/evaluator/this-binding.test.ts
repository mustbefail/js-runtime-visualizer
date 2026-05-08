import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — this binding', () => {
  it('this is undefined in a plain function call (strict mode)', () => {
    const { finalValue } = runCode(`
      function f() { return typeof this; }
      f();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'undefined' });
  });
  it('this is the receiver in a method call', () => {
    const { finalValue } = runCode(`
      const obj = { x: 7, get: function() { return this.x; } };
      obj.get();
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 7 });
  });
  it('Function.prototype.call sets this explicitly', () => {
    const { finalValue } = runCode(`
      function f() { return this.x; }
      const obj = { x: 99 };
      f.call(obj);
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 99 });
  });
});
