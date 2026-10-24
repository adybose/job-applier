import { useEffect, useState } from 'react';
import { listCalls, listRuns, minutesSaved, summarizeCalls, type ModelSummary, type RunRecord } from '../../shared/stats/runs';

/** Spec 08 R-UI-2: the "Lazy Payoff", computed from data that never leaves this browser. */
export function StatsView() {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [models, setModels] = useState<ModelSummary[]>([]);

  useEffect(() => {
    void (async () => {
      const [r, c] = await Promise.all([listRuns().catch(() => []), listCalls().catch(() => [])]);
      setRuns(r);
      setModels(summarizeCalls(c));
    })();
  }, []);

  if (!runs) return <p role="status">Loading…</p>;

  const total = (k: 'auto' | 'approved' | 'edited' | 'human' | 'skipped') => runs.reduce((n, r) => n + r[k], 0);
  const saved = runs.reduce((n, r) => n + minutesSaved(r), 0);
  const fields = total('auto') + total('approved') + total('edited') + total('human');
  const pct = (n: number) => (fields ? `${Math.round((n / fields) * 100)}%` : '—');

  return (
    <section aria-labelledby="stats-title">
      <h2 id="stats-title">Lazy Payoff</h2>
      <p className="muted">Counted on this computer only.</p>

      <dl className="stat-tiles">
        <div>
          <dt>Applications filled</dt>
          <dd>{runs.length}</dd>
        </div>
        <div>
          <dt>Minutes saved (estimate)</dt>
          <dd>{Math.round(saved)}</dd>
        </div>
        <div>
          <dt>Fields filled for you</dt>
          <dd>{fields}</dd>
        </div>
      </dl>
      <p className="muted">
        The estimate assumes 17 minutes per application by hand, minus the time cards were waiting for you and a minute to
        review.
      </p>

      {fields > 0 && (
        <table className="bench">
          <caption>Who filled what</caption>
          <tbody>
            <tr>
              <th scope="row">Automatically</th>
              <td>{total('auto')}</td>
              <td>{pct(total('auto'))}</td>
            </tr>
            <tr>
              <th scope="row">Approved by you (incl. edited)</th>
              <td>{total('approved') + total('edited')}</td>
              <td>{pct(total('approved') + total('edited'))}</td>
            </tr>
            <tr>
              <th scope="row">Done by you</th>
              <td>{total('human')}</td>
              <td>{pct(total('human'))}</td>
            </tr>
          </tbody>
        </table>
      )}

      {models.length > 0 && (
        <table className="bench">
          <caption>Models</caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Calls</th>
              <th scope="col">Avg time</th>
              <th scope="col">Tokens/s</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.model}>
                <td>{m.model}</td>
                <td>
                  {m.calls}
                  {m.failed ? ` (${m.failed} failed)` : ''}
                </td>
                <td>{(m.avgLatencyMs / 1000).toFixed(1)} s</td>
                <td>{m.tokensPerSecond.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {runs.length === 0 && <p>No applications yet. Your numbers show up here after your first review screen.</p>}
    </section>
  );
}
