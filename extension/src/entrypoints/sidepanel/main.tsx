import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../sidepanel/App';
import { listAnswers } from '../../shared/memory/answers';
import { saveFile } from '../../shared/profile/files';
import type { Profile } from '../../shared/profile/schema';
import { saveProfile } from '../../shared/profile/storage';
import * as page from '../../sidepanel/page';
import '../../sidepanel/styles.css';

// Test hooks: let Playwright drive the same helpers the panel uses. Only extension pages can see them.
(globalThis as unknown as { __lazyApplyPanel: typeof page }).__lazyApplyPanel = page;
(globalThis as unknown as { __lazyApplyTest: object }).__lazyApplyTest = {
  listAnswers,
  saveProfile: (p: Profile) => saveProfile(p, []),
  saveFile: (f: { kind: 'resume' | 'linkedin'; name: string; base64: string }) => {
    const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
    return saveFile({ kind: f.kind, name: f.name, type: 'application/pdf', size: bytes.byteLength, bytes: bytes.buffer });
  },
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
