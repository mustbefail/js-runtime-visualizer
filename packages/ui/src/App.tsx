import { useAtom } from '@reatom/react';
import { Toolbar } from './components/Toolbar';
import { EditorPaneLazy } from './components/EditorPaneLazy';
import { ScrubberPane } from './components/ScrubberPane';
import { CanvasPane } from './components/CanvasPane';
import { ConsoleView } from './components/ConsoleView';
import { Splitter } from './components/Splitter';
import { editorWidthAtom } from './atoms/session';
import './styles/app.css';

export function App() {
  const [width] = useAtom(editorWidthAtom);
  return (
    <div
      className="app"
      style={{ ['--editor-width' as never]: `${width}%` }}
    >
      <Toolbar />
      <EditorPaneLazy />
      <Splitter />
      <CanvasPane />
      <ConsoleView />
      <ScrubberPane />
    </div>
  );
}
