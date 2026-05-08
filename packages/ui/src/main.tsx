import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { context, connectLogger, clearStack } from '@reatom/core';
import { reatomContext } from '@reatom/react';
import { App } from './App';

// Disable the implicit global stack — every action runs in an explicit context.
clearStack();

const rootFrame = context.start();
if (import.meta.env.DEV) {
  rootFrame.run(connectLogger);
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root');
createRoot(rootEl).render(
  <StrictMode>
    <reatomContext.Provider value={rootFrame}>
      <App />
    </reatomContext.Provider>
  </StrictMode>,
);
