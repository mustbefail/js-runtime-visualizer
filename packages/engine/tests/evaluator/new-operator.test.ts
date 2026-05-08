import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — new operator (function constructor)', () => {
  it('new Foo() builds an object with [[Prototype]] = Foo.prototype', () => {
    const { finalValue } = runCode(`
      function Animal(name) { this.name = name; }
      const rex = new Animal('Rex');
      rex.name;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'Rex' });
  });
  it('inherited methods on Foo.prototype are reachable from instance', () => {
    const { finalValue } = runCode(`
      function Animal() {}
      Animal.prototype.greet = function() { return 'hi'; };
      const a = new Animal();
      a.greet();
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'hi' });
  });
  it('returning a primitive from constructor is ignored — the new object is returned', () => {
    const { finalValue } = runCode(`
      function Foo() { this.x = 1; return 42; }
      new Foo().x;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });
  it('returning an object from constructor REPLACES the new instance', () => {
    const { finalValue } = runCode(`
      function Foo() { this.x = 1; return { y: 2 }; }
      const r = new Foo();
      r.x === undefined && r.y;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 2 });
  });
});
