import { Toolbar } from './components/Toolbar';
import { EditorPane } from './components/EditorPane';
import { ScrubberPane } from './components/ScrubberPane';
import { SnapshotPane } from './components/SnapshotPane';
import { ConsoleView } from './components/ConsoleView';
import './styles/app.css';

export function App() {
  return (
    <div className="app">
      <Toolbar />
      <EditorPane />
      <SnapshotPane />
      <ConsoleView />
      <ScrubberPane />
    </div>
  );
}
