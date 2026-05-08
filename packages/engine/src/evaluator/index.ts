import { parse } from '../parser';
import { Heap } from '../runtime/heap';
import { CallStack } from '../runtime/frames';
import { EnvironmentRecord } from '../runtime/env';
import { SnapshotStore } from '../snapshot';
import type {
  Context,
  JSValue,
  RunOptions,
  RunResult,
  SourceLoc,
  StepEvent,
} from '../types';
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

  stack.push({ fn: 'global', fnName: '<global>', env: globalEnv, callSite: null });

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
  while (true) {
    const step = gen.next();
    if (step.done) {
      last = step.value;
      break;
    }
    const event: StepEvent = step.value;
    store.capture({
      eventKind: event.kind,
      loc: event.loc,
      heap,
      stack,
      consoleOut: ctx.consoleOut,
      highlights: {},
    });
  }

  return { snapshots: store.all(), finalValue: last };
}
