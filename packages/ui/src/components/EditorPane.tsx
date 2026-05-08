import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { useAtom, useAction } from '@reatom/react';
import { action } from '@reatom/core';
import { codeAtom } from '../atoms/session';

const setCodeAction = action((next: string) => codeAtom.set(next), 'setCodeAction');

export function EditorPane() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [code] = useAtom(codeAtom);
  const setCode = useAction(setCodeAction);

  // Mount once. Subsequent codeAtom changes are pushed via the second effect.
  useEffect(() => {
    if (!hostRef.current) return;
    const startState = EditorState.create({
      doc: code,
      extensions: [
        basicSetup,
        javascript(),
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
    // We intentionally mount once; later codeAtom syncs are handled below.
  }, []);

  // Mirror external codeAtom changes (e.g. on initial rehydrate from localStorage)
  // into the editor view, but only when the values diverge.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const docNow = view.state.doc.toString();
    if (docNow !== code) {
      view.dispatch({ changes: { from: 0, to: docNow.length, insert: code } });
    }
  }, [code]);

  return <div className="editor" ref={hostRef} />;
}
