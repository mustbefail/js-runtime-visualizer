import type { Frame, ICallStack } from '../types';

export class CallStack implements ICallStack {
  private frames: Frame[] = [];

  push(frame: Frame): void {
    this.frames.push(frame);
  }

  pop(): Frame | undefined {
    return this.frames.pop();
  }

  top(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }

  size(): number {
    return this.frames.length;
  }

  snapshot(): Frame[] {
    // shallow copy; env objects shared but bindings re-snapshotted by snapshot module
    return this.frames.map((f) => ({ ...f }));
  }
}
