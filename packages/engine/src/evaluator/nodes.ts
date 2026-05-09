import type * as A from 'acorn';
import { type JSValue, num, bool } from '../types';
import type { Reference, HeapObject, StepEvent } from '../types';
import type { Context } from '../types';
import { fromJsLiteral, toBoolean, toNumber } from './values';
import { EnvironmentRecord } from '../runtime/env';
import type { IEnvironmentRecord } from '../types';
import { getHostPrototypes } from '../runtime/builtins';
import { computeFreeVars } from './free-vars';

export function* evalNode(node: A.Node, ctx: Context): Generator<StepEvent, JSValue> {
  switch (node.type) {
    case 'Program':
      return yield* evalProgram(node as A.Program, ctx);
    case 'ExpressionStatement':
      return yield* evalNode((node as A.ExpressionStatement).expression, ctx);
    case 'Literal':
      return fromJsLiteral((node as A.Literal).value);
    case 'Identifier': {
      const name = (node as A.Identifier).name;
      if (name === 'undefined') return { kind: 'undefined' };
      const env = ctx.stack.top()!.env;
      if (!env.has(name)) {
        throw new Error(`ReferenceError: ${name} is not defined`);
      }
      const value = env.lookup(name);
      yield { kind: 'lookup', loc: locOf(node), payload: { name } };
      return value;
    }
    case 'BinaryExpression':
      return yield* evalBinary(node as A.BinaryExpression, ctx);
    case 'UnaryExpression':
      return yield* evalUnary(node as A.UnaryExpression, ctx);
    case 'VariableDeclaration':
      return yield* evalVarDecl(node as A.VariableDeclaration, ctx);
    case 'AssignmentExpression':
      return yield* evalAssign(node as A.AssignmentExpression, ctx);
    case 'BlockStatement':
      return yield* evalBlock(node as A.BlockStatement, ctx);
    case 'IfStatement':
      return yield* evalIf(node as A.IfStatement, ctx);
    case 'WhileStatement':
      return yield* evalWhile(node as A.WhileStatement, ctx);
    case 'ForStatement':
      return yield* evalFor(node as A.ForStatement, ctx);
    case 'FunctionDeclaration':
      return yield* evalFunctionDecl(node as A.FunctionDeclaration, ctx);
    case 'FunctionExpression':
      return makeFunctionRef(node as A.FunctionExpression, ctx, false);
    case 'ArrowFunctionExpression':
      return makeFunctionRef(node as A.ArrowFunctionExpression, ctx, true);
    case 'CallExpression':
      return yield* evalCall(node as A.CallExpression, ctx);
    case 'NewExpression':
      return yield* evalNew(node as A.NewExpression, ctx);
    case 'ReturnStatement':
      return yield* evalReturn(node as A.ReturnStatement, ctx);
    case 'UpdateExpression':
      return yield* evalUpdate(node as A.UpdateExpression, ctx);
    case 'ObjectExpression':
      return yield* evalObjectLiteral(node as A.ObjectExpression, ctx);
    case 'ArrayExpression':
      return yield* evalArrayLiteral(node as A.ArrayExpression, ctx);
    case 'MemberExpression':
      return yield* evalMember(node as A.MemberExpression, ctx);
    case 'LogicalExpression':
      return yield* evalLogical(node as A.LogicalExpression, ctx);
    case 'ConditionalExpression': {
      const cond = yield* evalNode((node as A.ConditionalExpression).test, ctx);
      return toBoolean(cond)
        ? yield* evalNode((node as A.ConditionalExpression).consequent, ctx)
        : yield* evalNode((node as A.ConditionalExpression).alternate, ctx);
    }
    case 'ThisExpression': {
      const top = ctx.stack.top();
      if (!top) throw new Error('Internal: no active frame for ThisExpression');
      return top.thisValue;
    }
    case 'ClassDeclaration':
    case 'ClassExpression':
      return yield* evalClass(node as A.Class, ctx);
    case 'Super':
      return evalSuperReceiver(ctx);
    case 'ThrowStatement':
      return yield* evalThrow(node as A.ThrowStatement, ctx);
    case 'TryStatement':
      return yield* evalTry(node as A.TryStatement, ctx);
    default:
      throw new Error(`UnsupportedError: AST node ${node.type} not implemented in plan 1`);
  }
}

function* evalProgram(node: A.Program, ctx: Context): Generator<StepEvent, JSValue> {
  yield* hoistStatements(node.body as A.Statement[], ctx);
  let last: JSValue = { kind: 'undefined' };
  for (const stmt of node.body) {
    if (stmt.type === 'FunctionDeclaration') continue; // already hoisted
    last = yield* evalNode(stmt, ctx);
  }
  return last;
}

function* evalBinary(node: A.BinaryExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const left = yield* evalNode(node.left, ctx);
  if (ctx.drillIn) {
    yield { kind: 'lookup', loc: locOf(node), payload: { phase: 'left-evaluated' } };
  }
  const right = yield* evalNode(node.right, ctx);
  if (ctx.drillIn) {
    yield { kind: 'lookup', loc: locOf(node), payload: { phase: 'right-evaluated' } };
  }
  const result = computeBinary(node.operator, left, right);
  if (ctx.drillIn) {
    yield { kind: 'lookup', loc: locOf(node), payload: { phase: 'binary-result' } };
  }
  return result;
}

function computeBinary(op: string, left: JSValue, right: JSValue): JSValue {
  switch (op) {
    case '+': {
      if (left.kind === 'string' || right.kind === 'string') {
        return { kind: 'string', value: stringify(left) + stringify(right) };
      }
      return { kind: 'number', value: toNumber(left) + toNumber(right) };
    }
    case '-':
      return { kind: 'number', value: toNumber(left) - toNumber(right) };
    case '*':
      return { kind: 'number', value: toNumber(left) * toNumber(right) };
    case '/':
      return { kind: 'number', value: toNumber(left) / toNumber(right) };
    case '%':
      return { kind: 'number', value: toNumber(left) % toNumber(right) };
    case '===':
      return { kind: 'boolean', value: strictEqual(left, right) };
    case '!==':
      return { kind: 'boolean', value: !strictEqual(left, right) };
    case '<':
      return { kind: 'boolean', value: toNumber(left) < toNumber(right) };
    case '>':
      return { kind: 'boolean', value: toNumber(left) > toNumber(right) };
    case '<=':
      return { kind: 'boolean', value: toNumber(left) <= toNumber(right) };
    case '>=':
      return { kind: 'boolean', value: toNumber(left) >= toNumber(right) };
    default:
      throw new Error(`Operator ${op} not supported in plan 1`);
  }
}

function* evalUnary(node: A.UnaryExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const arg = yield* evalNode(node.argument, ctx);
  switch (node.operator) {
    case '-':
      return num(-toNumber(arg));
    case '+':
      return num(toNumber(arg));
    case '!':
      return bool(!toBoolean(arg));
    case 'typeof':
      return { kind: 'string', value: typeOf(arg) };
    default:
      throw new Error(`Unary ${node.operator} not supported in plan 1`);
  }
}

function strictEqual(a: JSValue, b: JSValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'ref' && b.kind === 'ref') return a.id === b.id;
  if ('value' in a && 'value' in b) return a.value === b.value;
  return true;
}

function stringify(v: JSValue): string {
  switch (v.kind) {
    case 'undefined':
      return 'undefined';
    case 'null':
      return 'null';
    case 'boolean':
      return String(v.value);
    case 'number':
      return String(v.value);
    case 'string':
      return v.value;
    case 'ref':
      return '[object]';
  }
}

function typeOf(v: JSValue): string {
  switch (v.kind) {
    case 'undefined':
      return 'undefined';
    case 'null':
      return 'object';
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'ref':
      return 'object';
  }
}

function* evalVarDecl(node: A.VariableDeclaration, ctx: Context): Generator<StepEvent, JSValue> {
  const kind = node.kind as 'let' | 'const' | 'var';
  for (const decl of node.declarations) {
    const id = decl.id as A.Identifier;
    const env = ctx.stack.top()!.env;
    if (kind === 'var' && env.has(id.name)) {
      // var was pre-hoisted; only assign if there's an initialiser
      if (decl.init) {
        const value = yield* evalNode(decl.init, ctx);
        env.assign(id.name, value);
        yield { kind: 'assign', loc: locOf(node), payload: { name: id.name, kind } };
      }
    } else {
      const value: JSValue = decl.init ? yield* evalNode(decl.init, ctx) : { kind: 'undefined' };
      env.define(id.name, value, kind);
      yield { kind: 'assign', loc: locOf(node), payload: { name: id.name, kind } };
    }
  }
  return { kind: 'undefined' };
}

function* evalAssign(node: A.AssignmentExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const op = node.operator;

  // Compute the new value from current+rhs given the op. For `=`, ignores `current`
  // and just evaluates rhs. For arithmetic compound ops, evaluates rhs then
  // computeBinary. For &&=/||=/??=, applies short-circuit semantics.
  const computeCompound = function* (current: JSValue): Generator<StepEvent, JSValue> {
    if (op === '=') return yield* evalNode(node.right, ctx);
    if (op === '&&=') return toBoolean(current) ? yield* evalNode(node.right, ctx) : current;
    if (op === '||=') return toBoolean(current) ? current : yield* evalNode(node.right, ctx);
    if (op === '??=') {
      return current.kind === 'null' || current.kind === 'undefined'
        ? yield* evalNode(node.right, ctx)
        : current;
    }
    const rhs = yield* evalNode(node.right, ctx);
    const arithmeticOp = op.slice(0, -1); // "+=" → "+"
    return computeBinary(arithmeticOp, current, rhs);
  };

  if (node.left.type === 'Identifier') {
    const top = ctx.stack.top();
    if (!top) throw new Error('Internal: no active frame for assignment');
    const env = top.env;
    const current = op === '=' ? { kind: 'undefined' as const } : env.lookup(node.left.name);
    const value = yield* computeCompound(current);
    env.assign(node.left.name, value);
    yield { kind: 'assign', loc: locOf(node), payload: { name: node.left.name, op } };
    return value;
  }

  if (node.left.type === 'MemberExpression') {
    const objVal = yield* evalNode(node.left.object as A.Node, ctx);
    if (objVal.kind !== 'ref') {
      throw new Error('TypeError: assignment target is primitive');
    }
    const key = yield* memberKey(node.left, ctx);

    if (key === '__proto__') {
      const value = yield* evalNode(node.right, ctx);
      const heapObj2 = ctx.heap.get(objVal.id);
      if (!heapObj2) throw new Error('Internal: ref points to no heap object');
      if (value.kind === 'ref') ctx.heap.setPrototype(objVal.id, value);
      else if (value.kind === 'null') ctx.heap.setPrototype(objVal.id, null);
      else throw new Error('TypeError: __proto__ must be ref or null');
      yield { kind: 'proto-set', loc: locOf(node), payload: { id: objVal.id, via: '__proto__' } };
      return value;
    }

    const heapObj = ctx.heap.get(objVal.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    const current =
      op === '='
        ? { kind: 'undefined' as const }
        : (heapObj.ownProps.get(key) ?? { kind: 'undefined' as const });
    const value = yield* computeCompound(current);
    ctx.heap.setProp(objVal.id, key, value);
    const isProtoRewire =
      key === 'prototype' && heapObj.kind === 'function' && value.kind === 'ref';
    yield {
      kind: isProtoRewire ? 'proto-set' : 'mutate',
      loc: locOf(node),
      payload: { id: objVal.id, key, op },
    };
    return value;
  }

  throw new Error(`AssignmentExpression: unsupported target ${node.left.type}`);
}

function locOf(node: A.Node): { line: number; col: number } {
  return { line: node.loc?.start.line ?? 0, col: node.loc?.start.column ?? 0 };
}

function* evalBlock(node: A.BlockStatement, ctx: Context): Generator<StepEvent, JSValue> {
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: no active frame for BlockStatement');
  const blockEnv = new EnvironmentRecord(top.env);
  const saved = top.env;
  top.env = blockEnv;
  yield* hoistStatements(node.body as A.Statement[], ctx);
  let last: JSValue = { kind: 'undefined' };
  try {
    for (const stmt of node.body) {
      if (stmt.type === 'FunctionDeclaration') continue;
      last = yield* evalNode(stmt, ctx);
    }
  } finally {
    top.env = saved;
  }
  return last;
}

function* evalIf(node: A.IfStatement, ctx: Context): Generator<StepEvent, JSValue> {
  const test = yield* evalNode(node.test, ctx);
  if (toBoolean(test)) return yield* evalNode(node.consequent, ctx);
  if (node.alternate) return yield* evalNode(node.alternate, ctx);
  return { kind: 'undefined' };
}

function* evalWhile(node: A.WhileStatement, ctx: Context): Generator<StepEvent, JSValue> {
  while (toBoolean(yield* evalNode(node.test, ctx))) {
    yield* evalNode(node.body, ctx);
  }
  return { kind: 'undefined' };
}

function* evalFor(node: A.ForStatement, ctx: Context): Generator<StepEvent, JSValue> {
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: no active frame for ForStatement');
  const forEnv = new EnvironmentRecord(top.env);
  const saved = top.env;
  top.env = forEnv;
  try {
    if (node.init) yield* evalNode(node.init, ctx);
    while (node.test ? toBoolean(yield* evalNode(node.test, ctx)) : true) {
      yield* evalNode(node.body, ctx);
      if (node.update) yield* evalNode(node.update, ctx);
    }
  } finally {
    top.env = saved;
  }
  return { kind: 'undefined' };
}

class ReturnSignal {
  constructor(public value: JSValue) {}
}

export class ThrowSignal extends Error {
  public readonly value: JSValue;
  constructor(value: JSValue) {
    super(stringify(value));
    this.name = 'ThrowSignal';
    this.value = value;
  }
}

function makeFunctionRef(
  node: A.FunctionExpression | A.ArrowFunctionExpression | A.FunctionDeclaration,
  ctx: Context,
  isArrow: boolean,
): Reference {
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: no active frame for function definition');
  let closureEnv: IEnvironmentRecord = top.env;
  // Named function expression: introduce a binding scope so the function
  // body can reference itself by its declared name.
  let selfBindingName: string | undefined;
  if (node.type === 'FunctionExpression' && 'id' in node && node.id) {
    selfBindingName = node.id.name;
    closureEnv = new EnvironmentRecord(closureEnv);
  }
  const params = (node.params as A.Identifier[]).map((p) => p.name);
  const declName = node.type === 'FunctionDeclaration' && node.id ? node.id.name : selfBindingName;
  const ref = ctx.heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: null,
    closure: closureEnv,
    source: {
      ...(declName !== undefined ? { name: declName } : {}),
      params,
      body: node.body as A.Node,
      isArrow,
      freeVars: computeFreeVars(node as A.Function),
    },
  });
  // Auto-allocate Foo.prototype = { constructor: Foo }, [[Prototype]] = objectProto.
  const protos = getHostPrototypes(ctx.heap);
  const protoObj = ctx.heap.allocate({
    kind: 'object',
    ownProps: new Map<string, JSValue>([['constructor', ref]]),
    prototype: protos?.objectProto ?? null,
  });
  ctx.heap.setProp(ref.id, 'prototype', protoObj);
  // Functions themselves descend from Function.prototype.
  if (protos) {
    ctx.heap.setPrototype(ref.id, protos.functionProto);
  }
  if (selfBindingName) {
    closureEnv.define(selfBindingName, ref, 'const');
  }
  return ref;
}

function* evalFunctionDecl(
  node: A.FunctionDeclaration,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  const ref = makeFunctionRef(node, ctx, false);
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: no active frame for FunctionDeclaration');
  if (!node.id) throw new Error('FunctionDeclaration missing id');
  top.env.define(node.id.name, ref, 'var');
  yield {
    kind: 'allocate',
    loc: locOf(node),
    payload: { kind: 'function', name: node.id.name },
  };
  return { kind: 'undefined' };
}

function* evalCall(node: A.CallExpression, ctx: Context): Generator<StepEvent, JSValue> {
  // Special-case super() — parent constructor invocation.
  if (node.callee.type === 'Super') {
    const top = ctx.stack.top();
    if (!top) throw new Error('Internal: super() outside any frame');
    if (top.fn === 'global') throw new Error('SyntaxError: super() outside class constructor');
    const fnObj0 = ctx.heap.get(top.fn.id);
    const home = fnObj0?.source?.homeObject;
    if (!home) throw new Error('SyntaxError: super() requires home object');
    const homeObj = ctx.heap.get(home.id);
    const parentProto = homeObj?.prototype;
    if (!parentProto || parentProto.kind !== 'ref') {
      throw new Error('TypeError: cannot resolve super constructor — no parent prototype');
    }
    const parentProtoObj = ctx.heap.get(parentProto.id);
    const parentCtorVal = parentProtoObj?.ownProps.get('constructor');
    if (!parentCtorVal || parentCtorVal.kind !== 'ref') {
      throw new Error('TypeError: cannot resolve super constructor');
    }
    const parentObj = ctx.heap.get(parentCtorVal.id);
    if (!parentObj) throw new Error('Internal: parent constructor missing');
    const argsSuper: JSValue[] = [];
    for (const a of node.arguments) argsSuper.push(yield* evalNode(a as A.Node, ctx));
    return yield* invokeFunction(parentObj, parentCtorVal, top.thisValue, argsSuper, node, ctx);
  }

  // Determine `this` based on callee shape.
  let thisValue: JSValue = { kind: 'undefined' };
  let callee: JSValue;
  if (node.callee.type === 'MemberExpression') {
    const recv = yield* evalNode(node.callee.object as A.Node, ctx);
    // For super.method(), `this` stays as the current frame's thisValue.
    if (node.callee.object.type === 'Super') {
      const top = ctx.stack.top();
      thisValue = top ? top.thisValue : { kind: 'undefined' };
    } else if (recv.kind === 'ref') {
      thisValue = recv;
    }
    callee = yield* evalNodeMemberAsCallee(node.callee as A.MemberExpression, recv, ctx);
  } else {
    callee = yield* evalNode(node.callee as A.Node, ctx);
  }
  if (callee.kind !== 'ref') {
    throw new Error('TypeError: call target is not a function');
  }
  const fnObj = ctx.heap.get(callee.id);
  if (!fnObj || fnObj.kind !== 'function') {
    throw new Error('TypeError: callee is not a callable function');
  }

  const args: JSValue[] = [];
  for (const a of node.arguments) {
    args.push(yield* evalNode(a as A.Node, ctx));
  }

  // Intercept Function.prototype.call: shift first arg into thisValue.
  const builtinName = fnObj.ownProps.get('__builtin_name__');
  if (
    builtinName &&
    builtinName.kind === 'string' &&
    builtinName.value === 'Function.prototype.call'
  ) {
    const targetFn = thisValue;
    if (targetFn.kind !== 'ref') {
      throw new Error('TypeError: Function.prototype.call requires a function this');
    }
    const targetObj = ctx.heap.get(targetFn.id);
    if (!targetObj || targetObj.kind !== 'function') {
      throw new Error('TypeError: target is not a function');
    }
    const newThis = args[0] ?? { kind: 'undefined' };
    const newArgs = args.slice(1);
    return yield* invokeFunction(targetObj, targetFn, newThis, newArgs, node, ctx);
  }

  return yield* invokeFunction(fnObj, callee, thisValue, args, node, ctx);
}

function* evalReturn(node: A.ReturnStatement, ctx: Context): Generator<StepEvent, JSValue> {
  const v: JSValue = node.argument ? yield* evalNode(node.argument, ctx) : { kind: 'undefined' };
  throw new ReturnSignal(v);
}

function* evalUpdate(node: A.UpdateExpression, ctx: Context): Generator<StepEvent, JSValue> {
  if (node.argument.type !== 'Identifier') {
    throw new Error('UpdateExpression: only Identifier targets supported in plan 1');
  }
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: no active frame for UpdateExpression');
  const env = top.env;
  const before = env.lookup(node.argument.name);
  const beforeNum = toNumber(before);
  const afterNum = node.operator === '++' ? beforeNum + 1 : beforeNum - 1;
  const after: JSValue = { kind: 'number', value: afterNum };
  env.assign(node.argument.name, after);
  yield { kind: 'assign', loc: locOf(node), payload: { name: node.argument.name } };
  return node.prefix ? after : { kind: 'number', value: beforeNum };
}

function* evalObjectLiteral(node: A.ObjectExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const ref = ctx.heap.allocate({
    kind: 'object',
    ownProps: new Map(),
    prototype: getHostPrototypes(ctx.heap)?.objectProto ?? null,
  });
  yield { kind: 'allocate', loc: locOf(node), payload: { id: ref.id, kind: 'object' } };
  for (const propNode of node.properties) {
    if (propNode.type !== 'Property') {
      throw new Error('UnsupportedError: spread in object literals (plan 4)');
    }
    const p = propNode as A.Property;
    let key: string;
    if (!p.computed && p.key.type === 'Identifier') {
      key = p.key.name;
    } else {
      const k = yield* evalNode(p.key as A.Node, ctx);
      key = stringifyKey(k);
    }
    const value = yield* evalNode(p.value as A.Node, ctx);
    ctx.heap.setProp(ref.id, key, value);
    yield { kind: 'mutate', loc: locOf(p), payload: { id: ref.id, key } };
  }
  return ref;
}

function* evalArrayLiteral(node: A.ArrayExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const ref = ctx.heap.allocate({
    kind: 'array',
    ownProps: new Map(),
    prototype: getHostPrototypes(ctx.heap)?.arrayProto ?? null,
  });
  yield { kind: 'allocate', loc: locOf(node), payload: { id: ref.id, kind: 'array' } };
  for (let i = 0; i < node.elements.length; i++) {
    const elem = node.elements[i];
    if (elem === null) continue;
    const v = yield* evalNode(elem as A.Node, ctx);
    ctx.heap.setProp(ref.id, String(i), v);
  }
  ctx.heap.setProp(ref.id, 'length', { kind: 'number', value: node.elements.length });
  return ref;
}

function* evalMember(node: A.MemberExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const obj = yield* evalNode(node.object as A.Node, ctx);
  if (obj.kind !== 'ref') {
    throw new Error('TypeError: property access on primitive');
  }
  const key = yield* memberKey(node, ctx);

  if (key === '__proto__') {
    const heapObj = ctx.heap.get(obj.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    return heapObj.prototype ?? { kind: 'null' };
  }

  // Walk [[Prototype]] chain. Emit a proto-walk event for each hop after the
  // first own-property miss.
  const chain: string[] = [];
  let cur: Reference | null = obj;
  while (cur) {
    chain.push(cur.id);
    const heapObj = ctx.heap.get(cur.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    if (heapObj.ownProps.has(key)) {
      const value = heapObj.ownProps.get(key)!;
      yield {
        kind: 'lookup',
        loc: locOf(node),
        payload: { id: obj.id, key, foundOnId: cur.id, chain: [...chain] },
      };
      return value;
    }
    if (chain.length > 1) {
      yield {
        kind: 'proto-walk',
        loc: locOf(node),
        payload: { fromId: chain[chain.length - 2], toId: cur.id, key },
      };
    }
    cur = heapObj.prototype;
  }
  yield {
    kind: 'lookup',
    loc: locOf(node),
    payload: { id: obj.id, key, chain: [...chain], notFound: true },
  };
  return { kind: 'undefined' };
}

function* memberKey(node: A.MemberExpression, ctx: Context): Generator<StepEvent, string> {
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  const k = yield* evalNode(node.property as A.Node, ctx);
  return stringifyKey(k);
}

function stringifyKey(v: JSValue): string {
  switch (v.kind) {
    case 'string':
      return v.value;
    case 'number':
      return String(v.value);
    default:
      return stringify(v);
  }
}

function* evalLogical(node: A.LogicalExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const left = yield* evalNode(node.left, ctx);
  switch (node.operator) {
    case '&&':
      return toBoolean(left) ? yield* evalNode(node.right, ctx) : left;
    case '||':
      return toBoolean(left) ? left : yield* evalNode(node.right, ctx);
    case '??':
      return left.kind === 'null' || left.kind === 'undefined'
        ? yield* evalNode(node.right, ctx)
        : left;
    default:
      throw new Error(`Logical ${node.operator} not supported`);
  }
}

function* hoistStatements(body: A.Statement[], ctx: Context): Generator<StepEvent, void> {
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: no active frame for hoisting');
  const env = top.env;
  for (const stmt of body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      const ref = makeFunctionRef(stmt, ctx, false);
      if (env.has(stmt.id.name)) {
        env.assign(stmt.id.name, ref);
      } else {
        env.define(stmt.id.name, ref, 'var');
      }
      yield {
        kind: 'allocate',
        loc: locOf(stmt),
        payload: { kind: 'function', name: stmt.id.name, hoisted: true },
      };
    } else if (stmt.type === 'VariableDeclaration' && stmt.kind === 'var') {
      for (const decl of stmt.declarations) {
        if (decl.id.type === 'Identifier' && !env.has(decl.id.name)) {
          env.define(decl.id.name, { kind: 'undefined' }, 'var');
        }
      }
    }
  }
}

function* invokeFunction(
  fnObj: HeapObject,
  fnRef: Reference,
  thisValue: JSValue,
  args: JSValue[],
  node: A.CallExpression,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  if (fnObj.native) {
    const result = fnObj.native(args, { consoleOut: ctx.consoleOut });
    const lastLine = ctx.consoleOut[ctx.consoleOut.length - 1];
    yield {
      kind: 'console',
      loc: locOf(node),
      payload: { line: lastLine },
    };
    return result;
  }
  if (!fnObj.source || !fnObj.closure) {
    throw new Error('TypeError: callee is not a callable function');
  }
  const callEnv = new EnvironmentRecord(fnObj.closure);
  fnObj.source.params.forEach((name, i) =>
    callEnv.define(name, args[i] ?? { kind: 'undefined' }, 'let'),
  );
  ctx.stack.push({
    fn: fnRef,
    fnName: fnObj.source.name ?? '<anonymous>',
    env: callEnv,
    callSite: locOf(node),
    thisValue,
  });
  yield {
    kind: 'enter-frame',
    loc: locOf(node),
    payload: { fnName: fnObj.source.name },
  };
  if (thisValue.kind !== 'undefined') {
    yield { kind: 'bind-this', loc: locOf(node), payload: { thisValue } };
  }
  let returnValue: JSValue = { kind: 'undefined' };
  let completion: 'normal' | 'return' | 'throw' = 'normal';
  let pendingThrow: ThrowSignal | null = null;
  try {
    const body = fnObj.source.body;
    if (fnObj.source.isArrow && body.type !== 'BlockStatement') {
      returnValue = yield* evalNode(body, ctx);
    } else {
      yield* evalNode(body, ctx);
    }
  } catch (e) {
    if (e instanceof ReturnSignal) {
      returnValue = e.value;
      completion = 'return';
    } else if (e instanceof ThrowSignal) {
      pendingThrow = e;
      completion = 'throw';
    } else {
      throw e;
    }
  } finally {
    ctx.stack.pop();
    if (completion === 'throw') {
      yield {
        kind: 'unwind-frame',
        loc: locOf(node),
        payload: { fnName: fnObj.source?.name },
      };
    } else {
      yield {
        kind: 'leave-frame',
        loc: locOf(node),
        payload: { returnValue },
      };
    }
  }
  if (pendingThrow) throw pendingThrow;
  return returnValue;
}

function* evalNew(node: A.NewExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const callee = yield* evalNode(node.callee as A.Node, ctx);
  if (callee.kind !== 'ref') {
    throw new Error('TypeError: new target is not a function');
  }
  const fnObj = ctx.heap.get(callee.id);
  if (!fnObj || fnObj.kind !== 'function') {
    throw new Error('TypeError: new target is not a function');
  }
  // Look up Foo.prototype to use as [[Prototype]] for the new instance.
  const fooPrototype = fnObj.ownProps.get('prototype');
  const protoRef =
    fooPrototype && fooPrototype.kind === 'ref'
      ? fooPrototype
      : (getHostPrototypes(ctx.heap)?.objectProto ?? null);
  const instance = ctx.heap.allocate({
    kind: 'object',
    ownProps: new Map(),
    prototype: protoRef,
  });
  yield {
    kind: 'allocate',
    loc: locOf(node),
    payload: { id: instance.id, kind: 'object', via: 'new' },
  };

  const args: JSValue[] = [];
  for (const a of node.arguments) args.push(yield* evalNode(a as A.Node, ctx));

  const result = yield* invokeFunction(
    fnObj,
    callee,
    instance,
    args,
    node as unknown as A.CallExpression,
    ctx,
  );
  // Spec: if the constructor returned a non-primitive object, use it; else
  // return the new instance.
  if (result.kind === 'ref') return result;
  return instance;
}

function* evalNodeMemberAsCallee(
  node: A.MemberExpression,
  recv: JSValue,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  if (recv.kind !== 'ref') {
    throw new Error('TypeError: cannot call method on primitive');
  }
  const key = yield* memberKey(node, ctx);
  if (key === '__proto__') {
    const heapObj = ctx.heap.get(recv.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    return heapObj.prototype ?? { kind: 'null' };
  }
  // Walk chain identical to evalMember (own-first, then up [[Prototype]]).
  let cur: Reference | null = recv;
  while (cur) {
    const heapObj = ctx.heap.get(cur.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    if (heapObj.ownProps.has(key)) return heapObj.ownProps.get(key)!;
    cur = heapObj.prototype;
  }
  return { kind: 'undefined' };
}

function* evalClass(node: A.Class, ctx: Context): Generator<StepEvent, JSValue> {
  let ctorMethod: A.MethodDefinition | null = null;
  const instanceMethods: A.MethodDefinition[] = [];
  const staticMethods: A.MethodDefinition[] = [];
  for (const member of node.body.body) {
    if (member.type !== 'MethodDefinition') continue;
    if (member.kind === 'constructor') ctorMethod = member;
    else if (member.static) staticMethods.push(member);
    else instanceMethods.push(member);
  }

  // Build the class function from the constructor (or an empty one).
  const classFn: A.FunctionExpression = ctorMethod
    ? (ctorMethod.value as A.FunctionExpression)
    : ({
        type: 'FunctionExpression',
        params: [],
        body: {
          type: 'BlockStatement',
          body: [],
          start: node.start ?? 0,
          end: node.end ?? 0,
        } as A.BlockStatement,
        async: false,
        generator: false,
        loc: node.loc ?? null,
        start: node.start ?? 0,
        end: node.end ?? 0,
      } as unknown as A.FunctionExpression);
  const classRef = makeFunctionRef(classFn, ctx, false);

  // Tag class name on the heap object for debug labels.
  if (node.id) {
    const fnObj = ctx.heap.get(classRef.id);
    if (fnObj && fnObj.source) fnObj.source.name = node.id.name;
  }

  // Constructor's homeObject is the class's prototype, so super() inside
  // resolves the parent constructor via homeObject.[[Prototype]].constructor.
  const constructorObj = ctx.heap.get(classRef.id);
  if (constructorObj && constructorObj.source) {
    const protoForCtor = constructorObj.ownProps.get('prototype');
    if (protoForCtor && protoForCtor.kind === 'ref') {
      constructorObj.source.homeObject = protoForCtor;
    }
  }

  // extends: chain B.prototype.[[Prototype]] = A.prototype, B.[[Prototype]] = A.
  if (node.superClass) {
    const parent = yield* evalNode(node.superClass as A.Node, ctx);
    if (parent.kind !== 'ref') {
      throw new Error('TypeError: superclass is not a constructor');
    }
    const parentObj = ctx.heap.get(parent.id);
    if (!parentObj || parentObj.kind !== 'function') {
      throw new Error('TypeError: superclass is not a function');
    }
    const parentProto = parentObj.ownProps.get('prototype');
    if (parentProto && parentProto.kind === 'ref') {
      const protoRef2 = ctx.heap.get(classRef.id)?.ownProps.get('prototype');
      if (protoRef2 && protoRef2.kind === 'ref') {
        ctx.heap.setPrototype(protoRef2.id, parentProto);
      }
    }
    ctx.heap.setPrototype(classRef.id, parent);
    yield { kind: 'proto-set', loc: locOf(node), payload: { id: classRef.id, via: 'extends' } };
  }

  // Instance methods → Class.prototype.
  const classObj = ctx.heap.get(classRef.id)!;
  const protoVal = classObj.ownProps.get('prototype');
  if (!protoVal || protoVal.kind !== 'ref') {
    throw new Error('Internal: class function missing auto-allocated prototype');
  }
  for (const m of instanceMethods) {
    const methodRef = makeFunctionRef(m.value as A.FunctionExpression, ctx, false);
    const methodObj = ctx.heap.get(methodRef.id);
    if (methodObj && methodObj.source) {
      if (m.key.type === 'Identifier') methodObj.source.name = m.key.name;
      methodObj.source.homeObject = protoVal as Reference;
    }
    if (m.key.type === 'Identifier') {
      ctx.heap.setProp(protoVal.id, m.key.name, methodRef);
    }
  }

  // Static methods → class function itself.
  for (const m of staticMethods) {
    const methodRef = makeFunctionRef(m.value as A.FunctionExpression, ctx, false);
    const methodObj = ctx.heap.get(methodRef.id);
    if (methodObj && methodObj.source) {
      if (m.key.type === 'Identifier') methodObj.source.name = m.key.name;
      methodObj.source.homeObject = classRef;
    }
    if (m.key.type === 'Identifier') {
      ctx.heap.setProp(classRef.id, m.key.name, methodRef);
    }
  }

  // Bind into env if this is a declaration.
  if (node.type === 'ClassDeclaration' && node.id) {
    const top = ctx.stack.top();
    if (top) top.env.define(node.id.name, classRef, 'let');
  }

  yield {
    kind: 'allocate',
    loc: locOf(node),
    payload: { kind: 'function', name: node.id?.name, classDecl: true },
  };
  return classRef;
}

function evalSuperReceiver(ctx: Context): JSValue {
  const top = ctx.stack.top();
  if (!top) throw new Error('Internal: super outside any frame');
  if (top.fn === 'global') throw new Error('SyntaxError: super outside method');
  const fnObj = ctx.heap.get(top.fn.id);
  const home = fnObj?.source?.homeObject;
  if (!home) throw new Error('SyntaxError: super requires a home object');
  const homeObj = ctx.heap.get(home.id);
  if (!homeObj) throw new Error('Internal: home object missing');
  return homeObj.prototype ?? { kind: 'undefined' };
}

function* evalThrow(node: A.ThrowStatement, ctx: Context): Generator<StepEvent, JSValue> {
  const value = yield* evalNode(node.argument as A.Node, ctx);
  yield {
    kind: 'error',
    loc: locOf(node),
    payload: { value, message: stringify(value) },
  };
  throw new ThrowSignal(value);
}

function* evalTry(node: A.TryStatement, ctx: Context): Generator<StepEvent, JSValue> {
  let result: JSValue = { kind: 'undefined' };
  let pending:
    | { mode: 'throw'; signal: ThrowSignal }
    | { mode: 'return'; signal: ReturnSignal }
    | null = null;
  try {
    try {
      result = yield* evalNode(node.block as A.Node, ctx);
    } catch (e) {
      if (e instanceof ThrowSignal && node.handler) {
        const top = ctx.stack.top();
        if (!top) throw new Error('Internal: no active frame for try/catch');
        const catchEnv = new EnvironmentRecord(top.env);
        const saved = top.env;
        top.env = catchEnv;
        if (node.handler.param && node.handler.param.type === 'Identifier') {
          catchEnv.define(node.handler.param.name, e.value, 'let');
        }
        yield {
          kind: 'catch',
          loc: locOf(node.handler),
          payload: {
            paramName:
              node.handler.param && node.handler.param.type === 'Identifier'
                ? node.handler.param.name
                : undefined,
          },
        };
        try {
          result = yield* evalNode(node.handler.body as A.Node, ctx);
        } finally {
          top.env = saved;
        }
      } else if (e instanceof ThrowSignal) {
        pending = { mode: 'throw', signal: e };
      } else if (e instanceof ReturnSignal) {
        pending = { mode: 'return', signal: e };
      } else {
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof ThrowSignal) {
      pending = { mode: 'throw', signal: e };
    } else if (e instanceof ReturnSignal) {
      pending = { mode: 'return', signal: e };
    } else {
      throw e;
    }
  }
  if (node.finalizer) {
    yield* evalNode(node.finalizer as A.Node, ctx);
  }
  if (pending) {
    if (pending.mode === 'throw') throw pending.signal;
    throw pending.signal;
  }
  return result;
}

