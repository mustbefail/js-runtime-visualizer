# @js-runtime-visualizer/engine

Headless JavaScript interpreter that produces a stream of immutable
`Snapshot` objects suitable for time-travel UI rendering.

## Plan 1 scope

- Parser wrapper around Acorn.
- Synchronous evaluator covering: literals, arithmetic, variables
  (let/const/var), if/while/for, blocks with lexical scope, function
  declarations and expressions, arrow functions, closures, objects,
  arrays, member access, member assignment, console.log.
- SnapshotStore with Immer-frozen snapshots.
- Drill-in flag for sub-expression stepping.
- Single source of type contracts in `src/types.ts` (interfaces +
  type aliases). Class files (`heap.ts`, `env.ts`, `frames.ts`,
  `snapshot.ts`) implement `I`-prefix interfaces from there.

## Not yet (planned)

- Prototypes, `class`/`extends`, `new`, `Object.create`, `__proto__` — plan 4.
- `throw`/`try`/`catch` and traceback events — plan 5.
- Promises, microtasks, `setTimeout`, `async`/`await` — plan v2.
- Generators, `Symbol`, `Map`/`Set`, `Proxy` — plan v3.

## Usage

```ts
import { runCode } from '@js-runtime-visualizer/engine';

const { snapshots, finalValue } = runCode('let x = 1 + 2;');
console.log(finalValue); // { kind: 'number', value: 3 }
console.log(snapshots.length);
```

## Tests

```bash
npm test
```
