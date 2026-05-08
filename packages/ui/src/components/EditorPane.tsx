import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';
import { useAtom, useAction } from '@reatom/react';
import { action } from '@reatom/core';
import { codeAtom } from '../atoms/session';
import { currentSnapshotAtom } from '../atoms/derived';

const setCodeAction = action((next: string) => codeAtom.set(next), 'setCodeAction');

const setCurrentLine = StateEffect.define<number | null>();
const currentLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setCurrentLine)) {
        if (e.value === null) return Decoration.none;
        const lineCount = tr.state.doc.lines;
        if (e.value < 1 || e.value > lineCount) return Decoration.none;
        const lineInfo = tr.state.doc.line(e.value);
        return Decoration.set([
          Decoration.line({
            attributes: { style: 'background: rgba(250,179,135,0.18)' },
          }).range(lineInfo.from),
        ]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function EditorPane() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [code] = useAtom(codeAtom);
  const [snap] = useAtom(currentSnapshotAtom);
  const setCode = useAction(setCodeAction);

  useEffect(() => {
    if (!hostRef.current) return;
    const startState = EditorState.create({
      doc: code,
      extensions: [
        basicSetup,
        javascript(),
        currentLineField,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { fontFamily: 'JetBrains Mono, monospace' },
        }),
        EditorView.updateListener.of((vu) => {
          if (vu.docChanged) {
            const next = vu.state.doc.toString();
            if (next !== codeAtom()) setCode(next);
          }
        }),
      ],
    });
    const view = new EditorView({ state: startState, parent: hostRef.current });
    viewRef.current = view;
    return () => view.destroy();
  }, []);

  // External codeAtom → editor doc mirroring.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const docNow = view.state.doc.toString();
    if (docNow !== code) {
      view.dispatch({ changes: { from: 0, to: docNow.length, insert: code } });
    }
  }, [code]);

  // Push current line decoration whenever the snapshot changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const line = snap?.loc.line ?? null;
    view.dispatch({ effects: setCurrentLine.of(line) });
  }, [snap]);

  return <div className="editor" ref={hostRef} />;
}
