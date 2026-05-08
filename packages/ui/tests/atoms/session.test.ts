import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub a minimal localStorage so jsdom is not required.
//
// IMPORTANT: this MUST be installed on globalThis BEFORE `@reatom/core` is
// first imported. The `withLocalStorage` adapter is initialised eagerly at
// module load via an IIFE that reads `globalThis.localStorage` once. If the
// stub isn't there yet, Reatom silently falls back to in-memory storage and
// no writes ever reach our fakeStorage. So: stub first, then dynamic-import
// both `@reatom/core` and the session module inside each test.
const fakeStorage = (() => {
  let store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void (store = new Map()),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get store() {
      return store;
    },
    get length() {
      return store.size;
    },
  };
})();
vi.stubGlobal('localStorage', fakeStorage);

beforeEach(async () => {
  // Reset Reatom global context between tests so atom state doesn't leak.
  const { context } = await import('@reatom/core');
  context.reset();
});

afterEach(() => {
  fakeStorage.clear();
  vi.restoreAllMocks();
});

describe('session atoms — round-trip via localStorage', () => {
  it('codeAtom persists writes to localStorage', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    codeAtom.set('let x = 42;');
    const stored = fakeStorage.getItem('jsrv:code');
    expect(stored).toBeTruthy();
    expect(stored).toContain('let x = 42;');
  });

  it('drillInAtom default is false and toggles persist', async () => {
    const { drillInAtom } = await import('../../src/atoms/session');
    expect(drillInAtom()).toBe(false);
    drillInAtom.set(true);
    expect(drillInAtom()).toBe(true);
    expect(fakeStorage.getItem('jsrv:drillIn')).toBeTruthy();
  });

  it('scrubberSpeedAtom default is 1 and accepts integer multipliers', async () => {
    const { scrubberSpeedAtom } = await import('../../src/atoms/session');
    expect(scrubberSpeedAtom()).toBe(1);
    scrubberSpeedAtom.set(4);
    expect(scrubberSpeedAtom()).toBe(4);
  });
});
