import { freeze } from 'immer';
import type { CaptureInput, FrameSnapshot, ISnapshotStore, Snapshot } from './types';

export class SnapshotStore implements ISnapshotStore {
  private snaps: Snapshot[] = [];

  capture(input: CaptureInput): void {
    const callStack: FrameSnapshot[] = input.stack.snapshot().map((f) => ({
      fnName: f.fnName,
      callSite: f.callSite,
      bindings: f.env.snapshotBindings(),
    }));
    const heap = input.heap.snapshot();
    const snap: Snapshot = freeze<Snapshot>(
      {
        step: this.snaps.length,
        loc: input.loc,
        eventKind: input.eventKind,
        callStack,
        heap,
        consoleOut: [...input.consoleOut],
        highlights: { ...input.highlights },
        ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      },
      true,
    );
    this.snaps.push(snap);
  }

  length(): number {
    return this.snaps.length;
  }

  at(i: number): Snapshot {
    const s = this.snaps[i];
    if (!s) throw new Error(`SnapshotStore: out of range ${i}`);
    return s;
  }

  all(): Snapshot[] {
    return this.snaps;
  }
}
