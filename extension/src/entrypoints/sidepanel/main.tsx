import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../sidepanel/App';
import * as page from '../../sidepanel/page';
import '../../sidepanel/styles.css';

// Test hook: lets Playwright drive the same page helpers the panel uses. Only extension pages can see it.
(globalThis as unknown as { __lazyApplyPanel: typeof page }).__lazyApplyPanel = page;

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
