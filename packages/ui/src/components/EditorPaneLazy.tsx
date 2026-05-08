import { lazy, Suspense } from 'react';

const EditorPane = lazy(() =>
  import('./EditorPane').then((m) => ({ default: m.EditorPane })),
);

export function EditorPaneLazy() {
  return (
    <Suspense
      fallback={
        <div
          className="editor"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            fontSize: 12,
          }}
        >
          loading editor…
        </div>
      }
    >
      <EditorPane />
    </Suspense>
  );
}
