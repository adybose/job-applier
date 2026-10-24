import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { OnboardingView } from './views/OnboardingView';
import { ProfileView } from './views/ProfileView';
import { ReviewPanel } from './run/ReviewPanel';
import { useRun } from './run/useRun';
import { RunView } from './views/RunView';
import { SettingsView } from './views/SettingsView';
import { StatsView } from './views/StatsView';

const VIEWS = ['Onboarding', 'Profile', 'Run', 'Review', 'Settings', 'Stats'] as const;
type View = (typeof VIEWS)[number];

const ONBOARDING_KEY = 'onboarding.passed';

export function App() {
  const [view, setView] = useState<View | null>(null);
  const run = useRun();

  useEffect(() => {
    // Spec 08 AC-UI-1: Onboarding first until the model checks have passed once.
    void browser.storage.local.get(ONBOARDING_KEY).then((stored) => {
      setView(stored[ONBOARDING_KEY] === true ? 'Profile' : 'Onboarding');
    });
  }, []);

  async function onboardingPassed() {
    await browser.storage.local.set({ [ONBOARDING_KEY]: true });
    setView('Profile');
  }

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
        {view === null ? null : view === 'Onboarding' ? (
          <OnboardingView onPassed={onboardingPassed} />
        ) : view === 'Profile' ? (
          <ProfileView onSaved={() => setView('Run')} />
        ) : view === 'Run' ? (
          <RunView run={run} onNeedProfile={() => setView('Profile')} />
        ) : view === 'Review' ? (
          run.state.phase === 'REVIEW' || run.state.phase === 'DONE' ? (
            <ReviewPanel state={run.state} runner={run.runner} />
          ) : (
            <section aria-labelledby="review-empty">
              <h2 id="review-empty">Review</h2>
              <p className="muted">When every required field is done, your review appears here.</p>
            </section>
          )
        ) : view === 'Settings' ? (
          <SettingsView />
        ) : view === 'Stats' ? (
          <StatsView />
        ) : (
          <Placeholder name={view} />
        )}
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
