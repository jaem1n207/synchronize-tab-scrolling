import { StrictMode } from 'react';

import { App } from './pages/App';

import type { Root } from 'react-dom/client';

export const renderApp = ({ root }: { root: Root }) =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
