import { useState } from 'react';
import { SettingsView } from './views/SettingsView';

const VIEWS = ['Onboarding', 'Profile', 'Run', 'Review', 'Settings', 'Stats'] as const;
type View = (typeof VIEWS)[number];

export function App() {
  const [view, setView] = useState<View>('Onboarding');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Lazy Apply</h1>
        <nav aria-label="Views">
          <ul className="tabs">
            {VIEWS.map((v) => (
              <li key={v}>
                <button
                  type="button"
                  className="tab"
                  aria-current={v === view ? 'page' : undefined}
                  onClick={() => setView(v)}
                >
                  {v}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="app-main">
        {view === 'Settings' ? <SettingsView /> : <Placeholder name={view} />}
      </main>
    </div>
  );
}

function Placeholder({ name }: { name: View }) {
  return (
    <section aria-labelledby="view-title">
      <h2 id="view-title">{name}</h2>
      <p className="muted">Coming soon.</p>
    </section>
  );
}
