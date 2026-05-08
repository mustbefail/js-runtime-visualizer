import { Toolbar } from './components/Toolbar';
import { EditorPane } from './components/EditorPane';
import { ScrubberPane } from './components/ScrubberPane';
import { CanvasPane } from './components/CanvasPane';
import { ConsoleView } from './components/ConsoleView';
import './styles/app.css';

export function App() {
  return (
    <div className="app">
      <Toolbar />
      <EditorPane />
      <CanvasPane />
      <ConsoleView />
      <ScrubberPane />
    </div>
  );
}
