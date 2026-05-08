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

## Known plan-1 simplifications

- No `var`/`function` declaration hoisting — declarations are evaluated in source order. Tests must reference identifiers after their declaration.
- No logical operators (`&&`, `||`, `??`), no conditional expression (`a ? b : c`), no compound assignment (`+=`, `-=`, etc.), no named-function-expression self-reference. To be added in plan 4 alongside prototype work.
- No `this` binding — added in plan 4.
- Snapshots are deep-frozen via Immer but NOT yet structurally shared (each capture rebuilds the heap map). Spec §5.2 promises structural sharing; plan 2 entry task #1 will introduce it.
- `lookup` event kind is reused for drill-in sub-expression steps (with `payload.phase`); a dedicated kind may land later.
- Frame popped after `try { body } catch (ReturnSignal)` only — a non-Return throw leaves the frame on the stack. Acceptable for plan 1 (no user-level `throw`); will be moved to a `finally` in plan 5.

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
