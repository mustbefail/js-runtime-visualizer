# CLAUDE.md — project instructions

Read this before making changes. The project is built incrementally across five plans; respect the boundaries each plan draws.

## Project context

JS Runtime Visualizer — browser app that visualises step-by-step JS execution on an interactive canvas. The engine (`packages/engine`) is a custom tree-walking interpreter that produces immutable snapshots; the UI (planned in `packages/ui`) will render them with draggable call frames, heap nodes, and time travel.

- **Spec (single source of truth for goals):** `docs/superpowers/specs/2026-05-08-js-execution-visualizer-design.md`
- **Latest completed plan:** plan 1 (`docs/superpowers/plans/2026-05-08-plan-1-engine-foundation.md`)
- **Outstanding carry-over items:** `docs/superpowers/plan-1-carry-over.md`

## Working agreements

### Test-driven development

Every code change is preceded by a failing test. The plan files are explicit about this; follow it. Use Vitest with `--run` (never watch mode) when invoking from the harness:

```bash
npm test                            # runs `vitest --run` over the whole workspace
npx vitest --run packages/engine/tests/<file>.test.ts   # single file
```

### Type organisation

All type-level contracts for a package live in **one file**: `packages/<pkg>/src/types.ts`. This file holds:

- data shapes (e.g. `JSValue`, `HeapObject`, `Frame`, `Snapshot`, `StepEvent`)
- discriminated unions (e.g. `Primitive`)
- `I`-prefix interfaces describing class APIs (e.g. `IHeap`, `IEnvironmentRecord`, `ICallStack`, `ISnapshotStore`)
- small primitive value constructors when they are tightly coupled to the types

Class files (`heap.ts`, `env.ts`, `frames.ts`, `snapshot.ts`) keep only the implementation and add `implements I…` to bind to the contract. Do NOT redeclare interfaces or type aliases in class files. Do NOT use `.d.ts` for this — `.d.ts` cannot host classes with implementation.

When adding a new type, add it to `types.ts`, not to the file that introduces it. The contract file is documentation.

### Engine-vs-UI split

`packages/engine` is pure TypeScript with no DOM dependencies. It must stay testable with Node-only Vitest. The UI (when it lands in plan 2) is a separate package that imports the engine. Never reach into engine internals from UI code — only the public API in `packages/engine/src/index.ts`.

### Commit discipline

- Use conventional-commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- Scope each commit to a single change (per-task in the plans, with TDD red→green→commit).
- Don't amend commits that have been pushed. Amending is OK within a single in-flight task before review.

### Type strictness

Project tsconfig has `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all enabled. This catches real bugs in interpreter code. Do NOT relax flags to make code compile; instead:

- For `noUncheckedIndexedAccess`: use optional chaining or destructure with guards.
- For `exactOptionalPropertyTypes`: spread conditionally — `...(name !== undefined ? { name } : {})` — instead of `name: condition ? value : undefined`.

## Plan-1 simplifications (don't accidentally fix these elsewhere)

The engine ships these intentional gaps. They land in later plans:

- No `var`/`function` declaration hoisting. Plan 4.
- No logical (`&&`, `||`, `??`), conditional (`?:`), or compound assignment operators. Plan 4.
- No `this` binding. Plan 4.
- No prototypes, `class`, `new`, `Object.create`, `__proto__`. Plan 4.
- No `throw`/`try`/`catch`. Plan 5.
- No async (`Promise`, `setTimeout`, `async`/`await`, microtasks). Plan v2.
- Snapshots are deep-frozen via Immer but NOT structurally shared yet (memory cost grows with steps). Plan 2 entry-task.
- `lookup` event kind is reused for drill-in sub-expression steps via `payload.phase`. May get a dedicated kind later.
- Frame popped only via `ReturnSignal`; uncaught throws leave frames on the stack. Plan 5 will move `pop()` into a `finally`.

If a UI mock or snippet exercises one of these, that's a feature gap, not an engine bug. Confirm scope before patching.

## Tech stack and tools

| Concern              | Choice                  |
| -------------------- | ----------------------- |
| Runtime              | Node 20+                |
| Package manager      | npm workspaces          |
| Language             | TypeScript 5            |
| Test runner          | Vitest                  |
| Parser               | Acorn                   |
| Immutability         | Immer                   |
| Lint                 | ESLint                  |
| Format               | Prettier                |
| UI framework         | React + Vite (plan 2)   |
| State management     | Reatom (plan 2)         |
| Editor               | CodeMirror 6 (plan 2)   |

## Skill workflow

This project uses the superpowers skill set for design, planning, and execution:

- **Brainstorming → spec**: `superpowers:brainstorming` writes specs to `docs/superpowers/specs/`.
- **Spec → plan**: `superpowers:writing-plans` writes per-phase plans to `docs/superpowers/plans/`.
- **Plan → execution**: `superpowers:subagent-driven-development` dispatches a fresh implementer per task with two-stage review (spec compliance + code quality).
- **Branch completion**: `superpowers:finishing-a-development-branch`.

Each completed plan has a corresponding `feat/plan-N-…` branch that lands on `main`. The next plan is written only AFTER the previous plan's code is merged — plans reference real code.

## Conventions for adding new evaluator nodes

When adding support for a new AST node (in plans 4–5):

1. Write a Vitest golden test in `packages/engine/tests/evaluator/<feature>.test.ts` covering one happy-path + relevant edge cases.
2. Run it. Confirm it fails with a useful error from the current `evalNode` default branch.
3. Add the case in `evalNode` and helper(s) in `nodes.ts`. Yield appropriate `StepEvent`s.
4. If the feature is observable to the public API, also extend `tests/cross-check.test.ts` so it's compared against real V8.
5. Re-run the full suite. No regressions.
6. Commit per task.

## What to read before changing engine internals

Before editing any of these files, read the corresponding section in the spec or plan-1 carry-over:

- `evaluator/nodes.ts` — large dispatch table; touch one node at a time.
- `runtime/heap.ts` — note: per-instance `nextId`; do not regress to module-scope.
- `snapshot.ts` — uses Immer's `freeze(obj, true)` only; full structural sharing is a plan-2 task.
- `runtime/env.ts` — V8-aligned error messages (`has already been declared`, `Assignment to constant variable`); keep them aligned for cross-check.

## Where Claude Code should NOT make changes without explicit ask

- Don't edit `docs/superpowers/specs/`. Specs are written via the brainstorming skill in a deliberate session.
- Don't edit `docs/superpowers/plans/` after a plan has started executing. Amend via the writing-plans skill in a deliberate session.
- Don't reorganise the workspace structure. New packages go under `packages/`.

## How to report progress

When you complete a task or fix a bug, report:

- Files touched (absolute or repo-relative paths).
- Test counts before and after (e.g., 61 → 64).
- Any deviation from the plan as `DONE_WITH_CONCERNS`.
- The commit SHA.

Don't summarise what the spec says; the user has read it. Summarise only what you did and what's notable about it.
