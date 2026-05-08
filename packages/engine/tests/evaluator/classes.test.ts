import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — class declarations', () => {
  it('class with constructor sets instance fields via this', () => {
    const { finalValue } = runCode(`
      class Animal {
        constructor(name) { this.name = name; }
      }
      new Animal('Rex').name;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'Rex' });
  });
  it('class with instance methods places them on Class.prototype', () => {
    const { finalValue } = runCode(`
      class Animal {
        constructor(name) { this.name = name; }
        greet() { return this.name + ' hi'; }
      }
      new Animal('Rex').greet();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'Rex hi' });
  });
  it('class with static methods places them on the class itself', () => {
    const { finalValue } = runCode(`
      class Foo {
        static make() { return 'made'; }
      }
      Foo.make();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'made' });
  });
});
