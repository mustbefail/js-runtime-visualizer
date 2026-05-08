import { useEffect } from 'react';
import { useAtom, useAction } from '@reatom/react';
import { action } from '@reatom/core';
import { currentStepIndexAtom, isPlayingAtom } from '../atoms/ui';
import { totalStepsAtom, isAtStartAtom, isAtEndAtom } from '../atoms/derived';
import { scrubberSpeedAtom } from '../atoms/session';

const stepFirst = action(() => currentStepIndexAtom.set(0), 'stepFirst');
const stepPrev = action(
  () => currentStepIndexAtom.set((i) => Math.max(0, i - 1)),
  'stepPrev',
);
const stepNext = action(() => {
  const total = totalStepsAtom();
  currentStepIndexAtom.set((i) => Math.min(total - 1, i + 1));
}, 'stepNext');
const stepLast = action(() => {
  const total = totalStepsAtom();
  currentStepIndexAtom.set(Math.max(0, total - 1));
}, 'stepLast');
const togglePlay = action(
  () => isPlayingAtom.set((p) => !p),
  'togglePlay',
);
const setStep = action((i: number) => currentStepIndexAtom.set(i), 'setStep');
const setSpeed = action((n: number) => scrubberSpeedAtom.set(n), 'setSpeed');

export function ScrubberPane() {
  const [step] = useAtom(currentStepIndexAtom);
  const [total] = useAtom(totalStepsAtom);
  const [atStart] = useAtom(isAtStartAtom);
  const [atEnd] = useAtom(isAtEndAtom);
  const [playing] = useAtom(isPlayingAtom);
  const [speed] = useAtom(scrubberSpeedAtom);

  const onFirst = useAction(stepFirst);
  const onPrev = useAction(stepPrev);
  const onNext = useAction(stepNext);
  const onLast = useAction(stepLast);
  const onToggle = useAction(togglePlay);
  const onSetStep = useAction(setStep);
  const onSetSpeed = useAction(setSpeed);

  // Auto-advance when playing.
  useEffect(() => {
    if (!playing || total === 0) return;
    const interval = Math.max(20, 200 / speed);
    const id = window.setInterval(() => {
      const cur = currentStepIndexAtom();
      if (cur >= total - 1) {
        isPlayingAtom.set(false);
      } else {
        currentStepIndexAtom.set(cur + 1);
      }
    }, interval);
    return () => window.clearInterval(id);
  }, [playing, speed, total]);

  return (
    <div className="scrubber">
      <button onClick={onFirst} disabled={atStart || total === 0}>⏮</button>
      <button onClick={onPrev} disabled={atStart || total === 0}>◀</button>
      <button onClick={onToggle} disabled={total === 0}>{playing ? '⏸' : '▶'}</button>
      <button onClick={onNext} disabled={atEnd || total === 0}>▶</button>
      <button onClick={onLast} disabled={atEnd || total === 0}>⏭</button>
      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={step}
        onChange={(e) => onSetStep(Number(e.currentTarget.value))}
        style={{ flex: 1 }}
        disabled={total === 0}
      />
      <span style={{ color: 'var(--muted)', fontSize: 11, minWidth: 80, textAlign: 'right' }}>
        {total === 0 ? 'no run' : `${step + 1} / ${total}`}
      </span>
      <select value={speed} onChange={(e) => onSetSpeed(Number(e.currentTarget.value))}>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
        <option value={8}>8×</option>
      </select>
    </div>
  );
}
