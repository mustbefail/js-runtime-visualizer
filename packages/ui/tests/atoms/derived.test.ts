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

describe('derived atoms — scrubber bounds', () => {
  it('totalSteps reflects snapshots length', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { totalStepsAtom } = await import('../../src/atoms/derived');
    const { runAction } = await import('../../src/atoms/actions');

    expect(totalStepsAtom()).toBe(0);
    codeAtom.set('let x = 1;');
    runAction();
    expect(totalStepsAtom()).toBeGreaterThan(0);
  });

  it('isAtStart and isAtEnd reflect currentStepIndex bounds', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { currentStepIndexAtom } = await import('../../src/atoms/ui');
    const { isAtStartAtom, isAtEndAtom, totalStepsAtom } = await import('../../src/atoms/derived');
    const { runAction } = await import('../../src/atoms/actions');

    codeAtom.set('let x = 1; x;');
    runAction();
    const total = totalStepsAtom();
    expect(total).toBeGreaterThan(0);

    currentStepIndexAtom.set(0);
    expect(isAtStartAtom()).toBe(true);
    expect(isAtEndAtom()).toBe(false);

    currentStepIndexAtom.set(total - 1);
    expect(isAtStartAtom()).toBe(false);
    expect(isAtEndAtom()).toBe(true);
  });

  it('runAction resets currentStepIndex to last step on success', async () => {
    const { codeAtom } = await import('../../src/atoms/session');
    const { currentStepIndexAtom } = await import('../../src/atoms/ui');
    const { totalStepsAtom } = await import('../../src/atoms/derived');
    const { runAction } = await import('../../src/atoms/actions');

    codeAtom.set('let x = 1; x;');
    runAction();
    const total = totalStepsAtom();
    expect(currentStepIndexAtom()).toBe(total - 1);
  });
});
