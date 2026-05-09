import { parse } from '../parser';
import { Heap } from '../runtime/heap';
import { CallStack } from '../runtime/frames';
import { EnvironmentRecord } from '../runtime/env';
import { seedBuiltins } from '../runtime/builtins';
import { SnapshotStore } from '../snapshot';
import type { Context, JSValue, RunOptions, RunResult, SourceLoc, StepEvent } from '../types';
import { evalNode } from './nodes';

export function runCode(code: string, options: RunOptions = {}): RunResult {
  const parsed = parse(code);
  if (!parsed.ok) {
    throw new Error(
      `Parse error: ${parsed.error.message} at ${parsed.error.line}:${parsed.error.col}`,
    );
  }

  const heap = new Heap();
  const stack = new CallStack();
  const globalEnv = new EnvironmentRecord(null);
  const ctx: Context = {
    heap,
    stack,
    globalEnv,
    consoleOut: [],
    drillIn: options.drillIn ?? false,
  };

  seedBuiltins(heap, globalEnv);

  stack.push({
    fn: 'global',
    fnName: '<global>',
    env: globalEnv,
    callSite: null,
    thisValue: { kind: 'undefined' },
  });

  const store = new SnapshotStore();
  const initialLoc: SourceLoc = { line: 1, col: 0 };
  store.capture({
    eventKind: 'enter-frame',
    loc: initialLoc,
    heap,
    stack,
    consoleOut: ctx.consoleOut,
    highlights: { activeFrame: 0 },
  });

  const gen = evalNode(parsed.ast, ctx);
  let last: JSValue = { kind: 'undefined' };
  let lastLoc: SourceLoc = initialLoc;
  let runtimeError: { message: string } | undefined;
  try {
    for (;;) {
      const step = gen.next();
      if (step.done) {
        last = step.value;
        break;
      }
      const event: StepEvent = step.value;
      lastLoc = event.loc;
      store.capture({
        eventKind: event.kind,
        loc: event.loc,
        heap,
        stack,
        consoleOut: ctx.consoleOut,
        highlights: {},
        ...(event.kind === 'error' &&
        event.payload &&
        typeof event.payload === 'object' &&
        'message' in event.payload
          ? { errorMessage: String((event.payload as { message?: unknown }).message ?? '') }
          : {}),
      });
    }
  } catch (e) {
    // Uncaught throw escaped the program. The evaluator may have already
    // emitted an `error` event (user's `throw`); engine-internal errors
    // (e.g. ReferenceError from a missing identifier) bypass that path,
    // so we record a synthetic error snapshot here unconditionally so the
    // UI always has something to scrub to.
    const message = e instanceof Error ? e.message : String(e);
    store.capture({
      eventKind: 'error',
      loc: lastLoc,
      heap,
      stack,
      consoleOut: ctx.consoleOut,
      highlights: {},
      errorMessage: message,
    });
    runtimeError = { message };
  }

  return runtimeError
    ? { snapshots: store.all(), finalValue: last, runtimeError }
    : { snapshots: store.all(), finalValue: last };
}
