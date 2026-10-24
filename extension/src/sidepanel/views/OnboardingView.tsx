import { useCallback, useEffect, useState } from 'react';
import { createModelClient } from '../../shared/model';
import {
  benchmark,
  corsInstructions,
  detectOS,
  runChecks,
  type BenchmarkResult,
  type CheckReport,
} from '../../shared/model/checks';
import { pullCommand } from '../../shared/model/presets';
import { loadModelSettings } from '../../shared/model/settings';
import { CopyCommand } from '../components/CopyCommand';

const os = detectOS(navigator.platform);

export function OnboardingView({ onPassed }: { onPassed: () => void }) {
  const [report, setReport] = useState<CheckReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [bench, setBench] = useState<BenchmarkResult[] | null>(null);
  const [benching, setBenching] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const settings = await loadModelSettings();
    setReport(await runChecks(createModelClient(settings), settings));
    setChecking(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- run the checks once when the view opens
    void check();
  }, [check]);

  async function runBenchmark() {
    setBenching(true);
    const settings = await loadModelSettings();
    setBench(await benchmark(createModelClient(settings), settings));
    setBenching(false);
  }

  return (
    <section aria-labelledby="onboarding-title">
      <h2 id="onboarding-title">Set up your local model</h2>
      <p className="muted">Lazy Apply uses a model running on this computer. Nothing you upload leaves it.</p>

      {report === null ? (
        <p role="status">Checking…</p>
      ) : (
        <ol className="checklist">
          <li>
            <Status ok={report.reachable === 'ok'} />
            <div>
              <strong>Ollama is running</strong>
              {report.reachable === 'fail' && (
                <>
                  <p>Open the Ollama app, or start it from Terminal:</p>
                  <CopyCommand command="ollama serve" />
                  <p className="muted">Don't have it? Get it from ollama.com.</p>
                </>
              )}
            </div>
          </li>
          <li>
            <Status ok={report.cors === 'ok'} pending={report.cors === 'unknown'} />
            <div>
              <strong>Ollama allows Lazy Apply to connect</strong>
              {report.cors === 'fail' &&
                corsInstructions(os).map((step) => (
                  <div key={step.text}>
                    <p>{step.text}</p>
                    {step.command && <CopyCommand command={step.command} />}
                  </div>
                ))}
            </div>
          </li>
          {report.models.map((m) => (
            <li key={m.slot}>
              <Status ok={m.installed} />
              <div>
                <strong>
                  {m.model} is downloaded{report.models.length > 1 ? ` (${m.slot} model)` : ''}
                </strong>
                {!m.installed && <CopyCommand command={pullCommand(m.model)} />}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="actions">
        <button type="button" onClick={check} disabled={checking}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
        <button type="button" onClick={runBenchmark} disabled={benching || !report?.allPassed}>
          {benching ? 'Running…' : 'Quick benchmark'}
        </button>
        <button type="button" className="primary" onClick={onPassed} disabled={!report?.allPassed}>
          Continue
        </button>
      </div>

      {bench && (
        <table className="bench">
          <caption>Quick benchmark</caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Tokens/s</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {bench.map((b) => (
              <tr key={b.model}>
                <td>{b.model}</td>
                <td>{b.ok && b.tokensPerSecond !== undefined ? b.tokensPerSecond.toFixed(1) : '—'}</td>
                <td>{b.ok ? `${(b.latencyMs / 1000).toFixed(1)} s` : 'Failed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Status({ ok, pending = false }: { ok: boolean; pending?: boolean }) {
  const label = pending ? 'Not checked yet' : ok ? 'Done' : 'Needs attention';
  return (
    <span className={`status ${pending ? 'pending' : ok ? 'ok' : 'fail'}`} role="img" aria-label={label}>
      {pending ? '…' : ok ? '✓' : '!'}
    </span>
  );
}
