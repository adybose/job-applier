import { useState } from 'react';
import { requiredProgress, type Phase, type RunState } from '../../shared/agent/machine';
import { CardList } from '../run/Cards';
import { ReviewPanel } from '../run/ReviewPanel';
import { useRun } from '../run/useRun';

const PHASE_LABEL: Record<Phase, string> = {
  IDLE: 'Ready',
  NEEDS_PROFILE: 'Add your profile first',
  SCANNING: 'Reading the form…',
  FILLING: 'Filling in…',
  WAITING_APPROVAL: 'Waiting for your OK',
  WAITING_HUMAN: 'Your turn',
  REVIEW: 'Ready for your review',
  DONE: 'Done',
  PAUSED: 'Paused',
  STOPPED: 'Stopped',
};

export function RunView({ onNeedProfile }: { onNeedProfile: () => void }) {
  const { state, error, start, runner } = useRun();
  const [needProfile, setNeedProfile] = useState(false);
  const running = !['IDLE', 'STOPPED', 'DONE', 'NEEDS_PROFILE'].includes(state.phase);

  async function onStart() {
    const result = await start();
    setNeedProfile(result === 'no-profile');
  }

  return (
    <section aria-labelledby="run-title">
      <h2 id="run-title">Fill this application</h2>

      {!running && (
        <>
          <p className="muted">Lazy Apply fills what it safely can, asks you when it should, and never clicks Submit.</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void onStart()}>
              {state.phase === 'IDLE' ? 'Start' : 'Start again'}
            </button>
          </div>
        </>
      )}
      {needProfile && (
        <p role="alert">
          Add your CV or LinkedIn PDF first.{' '}
          <button type="button" className="link" onClick={onNeedProfile}>
            Go to Profile
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {state.phase !== 'IDLE' && <Status state={state} />}

      {running && (
        <div className="actions">
          {state.phase === 'PAUSED' ? (
            <button type="button" onClick={() => runner?.resume()}>
              Resume
            </button>
          ) : (
            <button type="button" onClick={() => runner?.pause()}>
              Pause
            </button>
          )}
          <button type="button" onClick={() => void runner?.stop()}>
            Stop
          </button>
        </div>
      )}

      {(state.phase === 'REVIEW' || state.phase === 'DONE') && <ReviewPanel state={state} runner={runner} />}
      <CardList state={state} runner={runner} />
      <ActionLog state={state} />
    </section>
  );
}

function Status({ state }: { state: RunState }) {
  const { done, total } = requiredProgress(state);
  return (
    <div className="status-block">
      <p className="phase" role="status">
        {PHASE_LABEL[state.phase]}
      </p>
      {total > 0 && (
        <div className="progress">
          <progress max={total} value={done} aria-label="Required fields done" />
          <span>
            {done} of {total} required fields
          </span>
        </div>
      )}
    </div>
  );
}

const LOG_ICON = { info: '•', filled: '✓', waiting: '?', blocked: '⛔', failed: '!', human: '✋' } as const;

function ActionLog({ state }: { state: RunState }) {
  if (!state.log.length) return null;
  return (
    <section aria-labelledby="log-title" className="log">
      <h3 id="log-title">What Lazy Apply did</h3>
      <ol aria-live="polite">
        {state.log.slice(0, 80).map((entry, i) => (
          <li key={`${entry.at}-${i}`} className={`log-${entry.kind}`}>
            <span aria-hidden="true" className="log-icon">
              {LOG_ICON[entry.kind]}
            </span>{' '}
            {entry.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
