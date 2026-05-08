import type * as A from 'acorn';
import { type JSValue, num, bool } from '../types';
import type { StepEvent } from '../types';
import type { Context } from '../types';
import { fromJsLiteral, toBoolean, toNumber } from './values';
import { EnvironmentRecord } from '../runtime/env';

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
    default:
      throw new Error(`UnsupportedError: AST node ${node.type} not implemented in plan 1`);
  }
}

function* evalProgram(node: A.Program, ctx: Context): Generator<StepEvent, JSValue> {
  let last: JSValue = { kind: 'undefined' };
  for (const stmt of node.body) {
    last = yield* evalNode(stmt, ctx);
  }
  return last;
}

function* evalBinary(node: A.BinaryExpression, ctx: Context): Generator<StepEvent, JSValue> {
  const left = yield* evalNode(node.left, ctx);
  const right = yield* evalNode(node.right, ctx);
  switch (node.operator) {
    case '+': {
      if (left.kind === 'string' || right.kind === 'string') {
        return { kind: 'string', value: stringify(left) + stringify(right) };
      }
      return num(toNumber(left) + toNumber(right));
    }
    case '-':
      return num(toNumber(left) - toNumber(right));
    case '*':
      return num(toNumber(left) * toNumber(right));
    case '/':
      return num(toNumber(left) / toNumber(right));
    case '%':
      return num(toNumber(left) % toNumber(right));
    case '===':
      return bool(strictEqual(left, right));
    case '!==':
      return bool(!strictEqual(left, right));
    case '<':
      return bool(toNumber(left) < toNumber(right));
    case '>':
      return bool(toNumber(left) > toNumber(right));
    case '<=':
      return bool(toNumber(left) <= toNumber(right));
    case '>=':
      return bool(toNumber(left) >= toNumber(right));
    default:
      throw new Error(`Operator ${node.operator} not supported in plan 1`);
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

function* evalVarDecl(
  node: A.VariableDeclaration,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  const kind = node.kind as 'let' | 'const' | 'var';
  for (const decl of node.declarations) {
    const id = decl.id as A.Identifier;
    const value: JSValue = decl.init
      ? yield* evalNode(decl.init, ctx)
      : { kind: 'undefined' };
    ctx.stack.top()!.env.define(id.name, value, kind);
    yield { kind: 'assign', loc: locOf(node), payload: { name: id.name, kind } };
  }
  return { kind: 'undefined' };
}

function* evalAssign(
  node: A.AssignmentExpression,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  if (node.operator !== '=') {
    throw new Error(`Compound assignment ${node.operator} not yet supported`);
  }
  const target = node.left as A.Identifier;
  const value = yield* evalNode(node.right, ctx);
  ctx.stack.top()!.env.assign(target.name, value);
  yield { kind: 'assign', loc: locOf(node), payload: { name: target.name } };
  return value;
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
  let last: JSValue = { kind: 'undefined' };
  try {
    for (const stmt of node.body) last = yield* evalNode(stmt, ctx);
  } finally {
    top.env = saved;
  }
  return last;
}

function* evalIf(
  node: A.IfStatement,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  const test = yield* evalNode(node.test, ctx);
  if (toBoolean(test)) return yield* evalNode(node.consequent, ctx);
  if (node.alternate) return yield* evalNode(node.alternate, ctx);
  return { kind: 'undefined' };
}

function* evalWhile(
  node: A.WhileStatement,
  ctx: Context,
): Generator<StepEvent, JSValue> {
  while (toBoolean(yield* evalNode(node.test, ctx))) {
    yield* evalNode(node.body, ctx);
  }
  return { kind: 'undefined' };
}

function* evalFor(
  node: A.ForStatement,
  ctx: Context,
): Generator<StepEvent, JSValue> {
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
