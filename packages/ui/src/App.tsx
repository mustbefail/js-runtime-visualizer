import { Toolbar } from './components/Toolbar';
import { EditorPaneLazy } from './components/EditorPaneLazy';
import { ScrubberPane } from './components/ScrubberPane';
import { CanvasPane } from './components/CanvasPane';
import { ConsoleView } from './components/ConsoleView';
import './styles/app.css';

export function App() {
  return (
    <div className="app">
      <Toolbar />
      <EditorPaneLazy />
      <CanvasPane />
      <ConsoleView />
      <ScrubberPane />
    </div>
  );
}
