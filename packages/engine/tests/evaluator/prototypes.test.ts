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
    // Object.create returned a plain ref; getPrototypeOf walked it. proto-walk
    // is emitted whenever a member-access chain extends past the receiver.
    expect(kinds.has('lookup')).toBe(true);
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

  it('proto-set propagates [[Prototype]] mutations into the snapshot stream', () => {
    const { snapshots } = runCode(`
      class A {}
      class B extends A {}
      new B();
    `);
    const last = snapshots[snapshots.length - 1]!;
    // Find B.prototype and A.prototype by walking back from a B instance.
    const bInstance = Array.from(last.heap.values())
      .reverse()
      .find((o) => o.kind === 'object' && o.prototype !== null && !o.source);
    expect(bInstance).toBeDefined();
    const bProtoRef = bInstance!.prototype!;
    const bProto = last.heap.get(bProtoRef.id)!;
    // B.prototype should NOT point to Object.prototype directly — it points to A.prototype.
    expect(bProto.prototype).not.toBeNull();
    const aProto = last.heap.get(bProto.prototype!.id)!;
    // A.prototype's prototype should be Object.prototype (root, prototype null).
    // The chain: B instance → B.prototype → A.prototype → Object.prototype → null.
    expect(aProto.prototype).not.toBeNull();
    const objectProto = last.heap.get(aProto.prototype!.id)!;
    expect(objectProto.prototype).toBeNull();
  });

  it('emits proto-walk events when a property is found on the prototype chain', () => {
    const { snapshots } = runCode(`
      const grandProto = { x: 1 };
      const proto = Object.create(grandProto);
      const obj = Object.create(proto);
      obj.x;
    `);
    const kinds = snapshots.map((s) => s.eventKind);
    expect(kinds).toContain('proto-walk');
  });
});
