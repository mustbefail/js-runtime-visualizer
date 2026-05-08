import type { IEnvironmentRecord, IHeap, JSValue } from '../types';

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
  const log = heap.allocate({
    kind: 'function',
    ownProps: new Map(),
    prototype: null,
    native: (args, ctx) => {
      ctx.consoleOut.push(args.map(stringifyForConsole).join(' '));
      return { kind: 'undefined' };
    },
  });

  const consoleObj = heap.allocate({
    kind: 'object',
    ownProps: new Map([['log', log]]),
    prototype: null,
  });

  globalEnv.define('console', consoleObj, 'const');
}
