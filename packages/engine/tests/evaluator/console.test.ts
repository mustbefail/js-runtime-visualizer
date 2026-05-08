import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — console.log', () => {
  it('writes plain values to console output', () => {
    const { snapshots } = runCode('console.log("hello", 42);');
    const last = snapshots[snapshots.length - 1];
    expect(last?.consoleOut).toEqual(['hello 42']);
  });

  it('writes object as ref id placeholder', () => {
    const { snapshots } = runCode('console.log({ a: 1 });');
    const last = snapshots[snapshots.length - 1];
    const out = last?.consoleOut[0];
    expect(out).toMatch(/^\[obj\d+\]$/);
  });

  it('emits a console step event', () => {
    const { snapshots } = runCode('console.log("x");');
    const kinds = snapshots.map((s) => s.eventKind);
    expect(kinds).toContain('console');
  });
});
