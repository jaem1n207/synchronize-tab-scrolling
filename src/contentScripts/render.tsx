import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';

import { App } from './pages/App';

export const renderApp = ({ root }: { root: Root }) => {
  return root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};
