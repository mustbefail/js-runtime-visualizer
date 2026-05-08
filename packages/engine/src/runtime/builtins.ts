import type {
  IEnvironmentRecord,
  IHeap,
  JSValue,
  NativeFn,
  Reference,
} from '../types';

function stringifyForConsole(v: JSValue): string {
  switch (v.kind) {
    case 'undefined':
      return 'undefined';
    case 'null':
      return 'null';
    case 'boolean':
    case 'number':
      return String(v.value);
    case 'string':
      return v.value;
    case 'ref':
      return `[${v.id}]`;
  }
}

export function seedBuiltins(heap: IHeap, globalEnv: IEnvironmentRecord): void {
  // 1. Object.prototype — the root of all object prototype chains.
  const objectProto = heap.allocate({
    kind: 'object',
    ownProps: new Map(),
    prototype: null,
  });

  // 2. Function.prototype — extends Object.prototype.
  const functionProto = heap.allocate({
    kind: 'object',
    ownProps: new Map(),
    prototype: objectProto,
  });

  // 3. Array.prototype — extends Object.prototype.
  const arrayProto = heap.allocate({
    kind: 'object',
    ownProps: new Map(),
    prototype: objectProto,
  });

  // 4. Object.create(proto) → new object with [[Prototype]] = proto.
  const objectCreate: NativeFn = (args, _ctx) => {
    const protoArg = args[0];
    let proto: Reference | null = null;
    if (protoArg && protoArg.kind === 'ref') proto = protoArg;
    else if (protoArg && protoArg.kind === 'null') proto = null;
    else throw new Error('TypeError: Object.create proto must be ref or null');
    return heap.allocate({ kind: 'object', ownProps: new Map(), prototype: proto });
  };
  const objectCreateRef = heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: functionProto,
    native: objectCreate,
  });

  // 5. Object.getPrototypeOf(obj) → ref or null.
  const objectGetPrototypeOf: NativeFn = (args, _ctx) => {
    const target = args[0];
    if (!target || target.kind !== 'ref') {
      throw new Error('TypeError: Object.getPrototypeOf expects an object');
    }
    const heapObj = heap.get(target.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    return heapObj.prototype ?? { kind: 'null' };
  };
  const objectGetPrototypeOfRef = heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: functionProto,
    native: objectGetPrototypeOf,
  });

  // 6. Object constructor — exposes .create, .getPrototypeOf, .prototype as own props.
  const objectCtor = heap.allocate({
    kind: 'function',
    ownProps: new Map<string, JSValue>([
      ['create', objectCreateRef],
      ['getPrototypeOf', objectGetPrototypeOfRef],
      ['prototype', objectProto],
    ]),
    prototype: functionProto,
  });

  // 7. Function.prototype.call — placeholder. The evaluator intercepts CallExpression
  //    and recognises this builtin via its __builtin_name__ own prop, performing
  //    the actual `this`-rebinding logic. If somehow invoked directly, throws.
  const fnCall: NativeFn = () => {
    throw new Error(
      'Internal: Function.prototype.call should be intercepted by evalCall, not invoked directly',
    );
  };
  const fnCallRef = heap.allocate({
    kind: 'function',
    ownProps: new Map<string, JSValue>([
      ['__builtin_name__', { kind: 'string', value: 'Function.prototype.call' }],
    ]),
    prototype: functionProto,
    native: fnCall,
  });
  // Attach call as an own prop on the already-allocated functionProto.
  const functionProtoObj = heap.get(functionProto.id)!;
  functionProtoObj.ownProps.set('call', fnCallRef);

  // 8. console.log.
  const log = heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: functionProto,
    native: (args, ctx) => {
      ctx.consoleOut.push(args.map(stringifyForConsole).join(' '));
      return { kind: 'undefined' };
    },
  });
  const consoleObj = heap.allocate({
    kind: 'object',
    ownProps: new Map<string, JSValue>([['log', log]]),
    prototype: objectProto,
  });

  // 9. Define globals.
  globalEnv.define('console', consoleObj, 'const');
  globalEnv.define('Object', objectCtor, 'const');

  // 10. Stash references so the evaluator can use them when allocating literals.
  attachHostPrototypes(heap, { objectProto, functionProto, arrayProto });
}

const hostProtoTable = new WeakMap<
  IHeap,
  { objectProto: Reference; functionProto: Reference; arrayProto: Reference }
>();

export function attachHostPrototypes(
  heap: IHeap,
  protos: { objectProto: Reference; functionProto: Reference; arrayProto: Reference },
): void {
  hostProtoTable.set(heap, protos);
}

export function getHostPrototypes(
  heap: IHeap,
):
  | { objectProto: Reference; functionProto: Reference; arrayProto: Reference }
  | null {
  return hostProtoTable.get(heap) ?? null;
}
