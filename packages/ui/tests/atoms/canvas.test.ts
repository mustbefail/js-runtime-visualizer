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

describe('canvas atoms — transient pan/zoom + drag', () => {
  it('panZoomAtom default is { panX: 0, panY: 0, scale: 1 } and is NOT persisted', async () => {
    const { panZoomAtom } = await import('../../src/atoms/canvas');
    expect(panZoomAtom()).toEqual({ panX: 0, panY: 0, scale: 1 });
    panZoomAtom.set({ panX: 100, panY: 50, scale: 2 });
    expect(panZoomAtom()).toEqual({ panX: 100, panY: 50, scale: 2 });
    expect(fakeStorage.getItem('jsrv:panZoom')).toBeNull();
  });

  it('dragStateAtom default is { active: false }', async () => {
    const { dragStateAtom } = await import('../../src/atoms/canvas');
    expect(dragStateAtom()).toEqual({ active: false });
    dragStateAtom.set({ active: true, id: 'obj1', pos: { x: 10, y: 20 } });
    expect(dragStateAtom()).toEqual({ active: true, id: 'obj1', pos: { x: 10, y: 20 } });
  });
});

describe('persisted canvas atoms', () => {
  it('nodePositionsAtom round-trips a Map via localStorage', async () => {
    const { nodePositionsAtom } = await import('../../src/atoms/session');
    const positions = new Map([['frame-0', { x: 50, y: 50 }], ['obj1', { x: 200, y: 50 }]]);
    nodePositionsAtom.set(positions);
    expect(nodePositionsAtom().get('frame-0')).toEqual({ x: 50, y: 50 });
    expect(fakeStorage.getItem('jsrv:nodePositions')).toBeTruthy();
  });

  it('collapsedIdsAtom round-trips a Set via localStorage', async () => {
    const { collapsedIdsAtom } = await import('../../src/atoms/session');
    const collapsed = new Set(['obj1', 'obj3']);
    collapsedIdsAtom.set(collapsed);
    expect(collapsedIdsAtom().has('obj1')).toBe(true);
    expect(collapsedIdsAtom().has('obj3')).toBe(true);
    expect(fakeStorage.getItem('jsrv:collapsedIds')).toBeTruthy();
  });
});
