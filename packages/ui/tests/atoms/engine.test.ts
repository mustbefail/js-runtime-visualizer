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

describe('engine atoms + run action', () => {
  it('runAction populates snapshots and finalValue from valid code', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { snapshotsAtom, finalValueAtom, runErrorAtom } = await import('../../src/atoms/engine');
    const { runAction } = await import('../../src/atoms/actions');

    codeAtom.set('let x = 1 + 2;');
    runAction();

    expect(snapshotsAtom().length).toBeGreaterThan(0);
    expect(finalValueAtom()).toEqual({ kind: 'undefined' });
    expect(runErrorAtom()).toBeNull();
  });

  it('runAction sets runErrorAtom on parse error', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { snapshotsAtom, runErrorAtom } = await import('../../src/atoms/engine');
    const { runAction } = await import('../../src/atoms/actions');

    codeAtom.set('let x =;');
    runAction();

    expect(runErrorAtom()).toMatch(/parse/i);
    expect(snapshotsAtom()).toEqual([]);
  });

  it('resetAction clears engine state but does not touch session', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { snapshotsAtom, finalValueAtom, runErrorAtom } = await import('../../src/atoms/engine');
    const { runAction, resetAction } = await import('../../src/atoms/actions');

    codeAtom.set('let x = 5;');
    runAction();
    expect(snapshotsAtom().length).toBeGreaterThan(0);

    resetAction();
    expect(snapshotsAtom()).toEqual([]);
    expect(finalValueAtom()).toBeNull();
    expect(runErrorAtom()).toBeNull();
    expect(codeAtom()).toBe('let x = 5;'); // session preserved
  });
});
