import type * as A from 'acorn';

// Computes the set of identifier names that a function references from its
// enclosing scope ("free variables"). Used to filter the [[Environment]]
// view so it only shows bindings the function actually closes over, instead
// of every name reachable up the scope chain.
//
// The analyzer favours over-inclusion when it encounters an unfamiliar
// shape: better to show an extra binding than to silently hide one.
export function computeFreeVars(fn: A.Function): Set<string> {
  const locals = new Set<string>();
  collectFunctionLocals(fn, locals);

  const free = new Set<string>();
  visit(fn.body as A.AnyNode, locals, free);
  return free;
}

function collectFunctionLocals(fn: A.Function, locals: Set<string>): void {
  for (const p of fn.params) collectBindings(p as A.AnyNode, locals);
  if (fn.type === 'FunctionExpression' && fn.id) locals.add(fn.id.name);
  if (fn.type !== 'ArrowFunctionExpression') locals.add('arguments');
  collectHoisted(fn.body as A.AnyNode, locals);
}

// Walks a function body collecting every var/let/const binding and inner
// function/class declaration into `locals`. Stops at nested function/class
// boundaries — those have their own scopes.
function collectHoisted(node: A.AnyNode | null | undefined, locals: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  switch (node.type) {
    case 'FunctionDeclaration':
      if (node.id) locals.add(node.id.name);
      return;
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return;
    case 'ClassDeclaration':
      if (node.id) locals.add(node.id.name);
      return;
    case 'ClassExpression':
      return;
    case 'VariableDeclaration':
      for (const d of node.declarations) collectBindings(d.id as A.AnyNode, locals);
      return;
  }
  for (const child of childNodes(node)) collectHoisted(child, locals);
}

function collectBindings(pat: A.AnyNode, locals: Set<string>): void {
  switch (pat.type) {
    case 'Identifier':
      locals.add(pat.name);
      return;
    case 'AssignmentPattern':
      collectBindings(pat.left as A.AnyNode, locals);
      return;
    case 'RestElement':
      collectBindings(pat.argument as A.AnyNode, locals);
      return;
    case 'ArrayPattern':
      for (const el of pat.elements) if (el) collectBindings(el as A.AnyNode, locals);
      return;
    case 'ObjectPattern':
      for (const p of pat.properties) {
        if (p.type === 'RestElement') collectBindings(p.argument as A.AnyNode, locals);
        else collectBindings(p.value as A.AnyNode, locals);
      }
      return;
  }
}

function visit(
  node: A.AnyNode | null | undefined,
  locals: Set<string>,
  free: Set<string>,
): void {
  if (!node || typeof node !== 'object' || !('type' in node)) return;

  switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      const inner = computeFreeVars(node);
      for (const v of inner) if (!locals.has(v)) free.add(v);
      return;
    }
    case 'ClassDeclaration':
    case 'ClassExpression': {
      if (node.superClass) visit(node.superClass as A.AnyNode, locals, free);
      for (const m of node.body.body) {
        if (m.type === 'MethodDefinition' || m.type === 'PropertyDefinition') {
          if (m.computed) visit(m.key as A.AnyNode, locals, free);
          if (m.value) {
            if (m.type === 'MethodDefinition') {
              const inner = computeFreeVars(m.value);
              for (const v of inner) if (!locals.has(v)) free.add(v);
            } else {
              visit(m.value as A.AnyNode, locals, free);
            }
          }
        }
      }
      return;
    }
    case 'Identifier':
      if (!locals.has(node.name)) free.add(node.name);
      return;
    case 'MemberExpression':
      visit(node.object as A.AnyNode, locals, free);
      if (node.computed) visit(node.property as A.AnyNode, locals, free);
      return;
    case 'Property':
      if (node.computed) visit(node.key as A.AnyNode, locals, free);
      visit(node.value as A.AnyNode, locals, free);
      return;
    case 'CatchClause': {
      const catchLocals = node.param ? new Set(locals) : locals;
      if (node.param) collectBindings(node.param as A.AnyNode, catchLocals);
      visit(node.body as A.AnyNode, catchLocals, free);
      return;
    }
    case 'LabeledStatement':
      visit(node.body as A.AnyNode, locals, free);
      return;
    case 'BreakStatement':
    case 'ContinueStatement':
      return;
    case 'VariableDeclarator':
      if (node.init) visit(node.init as A.AnyNode, locals, free);
      return;
  }

  for (const child of childNodes(node)) visit(child, locals, free);
}

function childNodes(node: A.AnyNode): Iterable<A.AnyNode> {
  const out: A.AnyNode[] = [];
  const record = node as unknown as Record<string, unknown>;
  for (const k of Object.keys(record)) {
    if (k === 'type' || k === 'loc' || k === 'start' || k === 'end' || k === 'range') continue;
    const v = record[k];
    if (Array.isArray(v)) {
      for (const c of v) if (isNode(c)) out.push(c);
    } else if (isNode(v)) {
      out.push(v);
    }
  }
  return out;
}

function isNode(v: unknown): v is A.AnyNode {
  return !!v && typeof v === 'object' && 'type' in (v as Record<string, unknown>);
}
