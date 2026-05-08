import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — prototype-aware member access', () => {
  it('reads a property from the prototype chain', () => {
    const { finalValue } = runCode(`
      const proto = { greet: 'hi' };
      const obj = Object.create(proto);
      obj.greet;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'hi' });
  });
  it('returns undefined when the property is absent in the entire chain', () => {
    const { finalValue } = runCode(`
      const proto = { x: 1 };
      const obj = Object.create(proto);
      obj.missing;
    `);
    expect(finalValue).toEqual({ kind: 'undefined' });
  });
  it('prefers own properties over prototype properties', () => {
    const { finalValue } = runCode(`
      const proto = { x: 'proto' };
      const obj = Object.create(proto);
      obj.x = 'own';
      obj.x;
    `);
    expect(finalValue).toEqual({ kind: 'string', value: 'own' });
  });
  it('Object.getPrototypeOf returns the [[Prototype]]', () => {
    const { finalValue, snapshots } = runCode(`
      const proto = {};
      const obj = Object.create(proto);
      const got = Object.getPrototypeOf(obj);
      got === proto;
    `);
    expect(finalValue).toEqual({ kind: 'boolean', value: true });
    const kinds = new Set(snapshots.map((s) => s.eventKind));
    expect(kinds.has('proto-walk') || kinds.has('lookup')).toBe(true);
  });
  it('emits a proto-set event when assigning to a function .prototype', () => {
    const { snapshots } = runCode(`
      function F() {}
      F.prototype = { x: 1 };
    `);
    const kinds = snapshots.map((s) => s.eventKind);
    expect(kinds).toContain('proto-set');
  });
  it('__proto__ reads and writes [[Prototype]]', () => {
    const { finalValue } = runCode(`
      const proto = { x: 1 };
      const obj = {};
      obj.__proto__ = proto;
      obj.x;
    `);
    expect(finalValue).toEqual({ kind: 'number', value: 1 });
  });
  it('reading __proto__ returns the [[Prototype]] ref or null', () => {
    const { finalValue } = runCode(`
      const proto = {};
      const obj = Object.create(proto);
      Object.getPrototypeOf(obj) === obj.__proto__;
    `);
    expect(finalValue).toEqual({ kind: 'boolean', value: true });
  });
});
