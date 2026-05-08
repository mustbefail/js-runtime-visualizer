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
  it('extends chains prototype.[[Prototype]] to the parent.prototype', () => {
    const { finalValue } = runCode(`
      class A { greet() { return 'a'; } }
      class B extends A {}
      new B().greet();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'a' });
  });
  it('extends chains static method inheritance', () => {
    const { finalValue } = runCode(`
      class A { static make() { return 'a'; } }
      class B extends A {}
      B.make();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'a' });
  });
  it('super(...) calls parent constructor with current this', () => {
    const { finalValue } = runCode(`
      class A { constructor(x) { this.x = x; } }
      class B extends A {
        constructor(x, y) { super(x); this.y = y; }
      }
      const b = new B(1, 2);
      b.x + b.y;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 3 });
  });
  it('super.method() walks the parent prototype', () => {
    const { finalValue } = runCode(`
      class A { greet() { return 'a'; } }
      class B extends A { greet() { return super.greet() + 'b'; } }
      new B().greet();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'ab' });
  });
});
