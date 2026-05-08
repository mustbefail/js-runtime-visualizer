import type * as A from 'acorn';
import { type JSValue, num, bool } from '../types';
import type { Reference, StepEvent } from '../types';
import type { Context } from '../types';
import { fromJsLiteral, toBoolean, toNumber } from './values';
import { EnvironmentRecord } from '../runtime/env';
import type { IEnvironmentRecord } from '../types';

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

function* evalAssign(
  node: A.AssignmentExpression,
  ctx: Context,
): Generator<StepEvent, JSValue> {
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
    const heapObj = ctx.heap.get(objVal.id);
    if (!heapObj) throw new Error('Internal: ref points to no heap object');
    const current =
      op === '=' ? { kind: 'undefined' as const } : (heapObj.ownProps.get(key) ?? { kind: 'undefined' as const });
    const value = yield* computeCompound(current);
    ctx.heap.setProp(objVal.id, key, value);
    yield { kind: 'mutate', loc: locOf(node), payload: { id: objVal.id, key, op } };
    return value;
  }

  throw new Error(`AssignmentExpression: unsupported target ${node.left.type}`);
}

function locOf(node: A.Node): { line: number; col: number } {
  return { line: node.loc?.start.line ?? 0, col: node.loc?.start.column ?? 0 };
}

function* evalBlock(
  node: A.BlockStatement,
  ctx: Context,
): Generator<StepEvent, JSValue> {
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
  const declName =
    node.type === 'FunctionDeclaration' && node.id
      ? node.id.name
      : selfBindingName;
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
    },
  });
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
  const callee = yield* evalNode(node.callee as A.Node, ctx);
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
    fn: callee,
    fnName: fnObj.source.name ?? '<anonymous>',
    env: callEnv,
    callSite: locOf(node),
  });
  yield {
    kind: 'enter-frame',
    loc: locOf(node),
    payload: { fnName: fnObj.source.name },
  };

  let returnValue: JSValue = { kind: 'undefined' };
  try {
    const body = fnObj.source.body;
    if (fnObj.source.isArrow && body.type !== 'BlockStatement') {
      // concise-body arrow: body is the expression itself
      returnValue = yield* evalNode(body, ctx);
    } else {
      yield* evalNode(body, ctx);
    }
  } catch (e) {
    if (e instanceof ReturnSignal) {
      returnValue = e.value;
    } else {
      throw e;
    }
  }

  ctx.stack.pop();
  yield {
    kind: 'leave-frame',
    loc: locOf(node),
    payload: { returnValue },
  };
  return returnValue;
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
    prototype: null,
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
    prototype: null,
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
    throw new Error('TypeError: property access on primitive (plan 4 will lift via prototypes)');
  }
  const key = yield* memberKey(node, ctx);
  const heapObj = ctx.heap.get(obj.id);
  if (!heapObj) throw new Error('Internal: ref points to no heap object');
  const v = heapObj.ownProps.get(key);
  yield { kind: 'lookup', loc: locOf(node), payload: { id: obj.id, key } };
  return v ?? { kind: 'undefined' };
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

function* hoistStatements(
  body: A.Statement[],
  ctx: Context,
): Generator<StepEvent, void> {
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
