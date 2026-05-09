import { describe, it, expect } from 'vitest';
import { parse } from 'acorn';
import type * as A from 'acorn';
import { computeFreeVars } from '../../src/evaluator/free-vars';

function firstFn(src: string): A.Function {
  const ast = parse(src, { ecmaVersion: 2022, sourceType: 'script' }) as A.Program;
  for (const stmt of ast.body) {
    if (stmt.type === 'FunctionDeclaration') return stmt;
    if (stmt.type === 'VariableDeclaration') {
      const init = stmt.declarations[0]?.init;
      if (
        init &&
        (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression')
      ) {
        return init;
      }
    }
    if (stmt.type === 'ExpressionStatement') {
      const e = stmt.expression;
      if (e.type === 'FunctionExpression' || e.type === 'ArrowFunctionExpression') return e;
    }
  }
  throw new Error('no function found');
}

describe('computeFreeVars', () => {
  it('returns empty set when nothing is captured', () => {
    expect(computeFreeVars(firstFn('function f() { return 1; }'))).toEqual(new Set());
  });

  it('captures simple outer reference', () => {
    expect(computeFreeVars(firstFn('function f() { return n; }'))).toEqual(new Set(['n']));
  });

  it('treats locals declared in body as bound', () => {
    expect(computeFreeVars(firstFn('function f() { let n = 1; return n; }'))).toEqual(new Set());
  });

  it('treats parameters as bound', () => {
    expect(computeFreeVars(firstFn('function f(n) { return n; }'))).toEqual(new Set());
  });

  it('captures globals like Error when actually referenced', () => {
    expect(
      computeFreeVars(firstFn('function f() { throw new Error("x"); }')),
    ).toEqual(new Set(['Error']));
  });

  it('does not flag property names as references', () => {
    expect(computeFreeVars(firstFn('function f() { return obj.prop; }'))).toEqual(new Set(['obj']));
  });

  it('flags identifiers in computed property positions', () => {
    expect(computeFreeVars(firstFn('function f() { return obj[key]; }'))).toEqual(
      new Set(['obj', 'key']),
    );
  });

  it('catch parameter is local to its body', () => {
    expect(
      computeFreeVars(firstFn('function f() { try {} catch (e) { return e + x; } }')),
    ).toEqual(new Set(['x']));
  });

  it('inner function — outer subtracts its own locals from inner free set', () => {
    const fn = firstFn('function outer() { let a = 1; return function () { return a + b; }; }');
    expect(computeFreeVars(fn)).toEqual(new Set(['b']));
  });

  it('named function expression — its own name is local to itself', () => {
    expect(
      computeFreeVars(firstFn('const f = function rec(n) { return rec(n); };')),
    ).toEqual(new Set());
  });

  it('object shorthand property uses its identifier as a value reference', () => {
    expect(computeFreeVars(firstFn('function f() { return { x }; }'))).toEqual(new Set(['x']));
  });

  it('arrow does not implicitly bind arguments', () => {
    const fn = firstFn('const f = () => arguments;');
    expect(computeFreeVars(fn)).toEqual(new Set(['arguments']));
  });

  it('regular function implicitly binds arguments', () => {
    expect(computeFreeVars(firstFn('function f() { return arguments; }'))).toEqual(new Set());
  });
});
