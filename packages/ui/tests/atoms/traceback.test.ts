import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeStorage = (() => {
  let store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void (store = new Map()),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
})();
vi.stubGlobal('localStorage', fakeStorage);

beforeEach(() => {
  vi.resetModules();
  fakeStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tracebackAtom', () => {
  it('returns null when no error event is in the current snapshot stream', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { tracebackAtom } = await import('../../src/atoms/derived');
    const { runAction } = await import('../../src/atoms/actions');

    codeAtom.set('let x = 1;');
    runAction();
    expect(tracebackAtom()).toBeNull();
  });

  it('returns the traceback when the current snapshot is at an error event', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { currentStepIndexAtom } = await import('../../src/atoms/ui');
    const { tracebackAtom } = await import('../../src/atoms/derived');
    const { snapshotsAtom } = await import('../../src/atoms/engine');
    const { runAction } = await import('../../src/atoms/actions');

    codeAtom.set(`
      function inner() { throw 'boom'; }
      function outer() { inner(); }
      try { outer(); } catch (e) {}
    `);
    runAction();
    const snaps = snapshotsAtom();
    const errIdx = snaps.findIndex((s) => s.eventKind === 'error');
    expect(errIdx).toBeGreaterThan(-1);
    currentStepIndexAtom.set(errIdx);
    const tb = tracebackAtom();
    expect(tb).not.toBeNull();
    expect(tb!.message).toContain('boom');
    expect(tb!.frames.length).toBeGreaterThanOrEqual(2);
  });

  it('marks the traceback as caught when a catch event follows in the stream', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { currentStepIndexAtom } = await import('../../src/atoms/ui');
    const { tracebackAtom } = await import('../../src/atoms/derived');
    const { snapshotsAtom } = await import('../../src/atoms/engine');
    const { runAction } = await import('../../src/atoms/actions');

    codeAtom.set(`try { throw 'x'; } catch (e) {}`);
    runAction();
    const snaps = snapshotsAtom();
    const errIdx = snaps.findIndex((s) => s.eventKind === 'error');
    currentStepIndexAtom.set(errIdx);
    const tb = tracebackAtom();
    expect(tb?.caught).toBe(true);
  });
});
