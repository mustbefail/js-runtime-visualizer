import type * as A from 'acorn';
import { type JSValue, num, bool } from '../types';
import type { StepEvent } from '../types';
import type { Context } from '../types';
import { fromJsLiteral, toBoolean, toNumber } from './values';

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
      throw new Error(`Identifier '${name}' not yet supported (Task 7 will add bindings)`);
    }
    case 'BinaryExpression':
      return yield* evalBinary(node as A.BinaryExpression, ctx);
    case 'UnaryExpression':
      return yield* evalUnary(node as A.UnaryExpression, ctx);
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
