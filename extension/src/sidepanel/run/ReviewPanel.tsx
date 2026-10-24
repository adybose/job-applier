import type { Decision, FieldState, RunState } from '../../shared/agent/machine';
import { requiredProgress } from '../../shared/agent/machine';
import type { Runner } from './runner';

const DECISION_LABEL: Record<Decision, string> = {
  auto: 'Auto',
  approved: 'Approved',
  edited: 'Edited',
  human: 'You did it',
  skipped: 'Skipped',
};

/** Spec 06 R-HL-11..R-HL-13. */
export function ReviewPanel({ state, runner }: { state: RunState; runner: Runner | null }) {
  const touched = state.order
    .map((id) => state.fields[id])
    .filter((f): f is FieldState => !!f && !!f.decidedBy && f.route !== 'skip');
  const leftEmpty = state.order
    .map((id) => state.fields[id])
    .filter((f): f is FieldState => !!f && f.route === 'skip');
  const { done, total } = requiredProgress(state);
  const skippedRequired = touched.filter((f) => f.field.required && f.decidedBy === 'skipped').length;

  return (
    <section aria-labelledby="review-title" className="review">
      <h3 id="review-title">Review and click Submit yourself.</h3>
      <p>
        Lazy Apply never submits. The Submit button on the page is outlined in green.
        {total > 0 && ` ${done} of ${total} required fields are done.`}
      </p>
      {skippedRequired > 0 && (
        <p className="warn-text" role="alert">
          You skipped {skippedRequired} required {skippedRequired === 1 ? 'field' : 'fields'}. The form may not submit until{' '}
          {skippedRequired === 1 ? 'it is' : 'they are'} filled.
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={() => void runner?.highlightSubmit()}>
          Show me Submit
        </button>
        {state.phase === 'REVIEW' && (
          <button type="button" className="primary" onClick={() => void runner?.finish()}>
            I've submitted it
          </button>
        )}
      </div>

      <table className="review-table">
        <caption className="sr-only">Every field Lazy Apply touched</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Value</th>
            <th scope="col">How</th>
          </tr>
        </thead>
        <tbody>
          {touched.map((f) => (
            <tr key={f.field.id} className={f.field.required && f.decidedBy === 'skipped' ? 'row-warn' : undefined}>
              <th scope="row">
                <button type="button" className="link" onClick={() => void runner?.focus(f.field.id)}>
                  {f.field.label}
                </button>
                {f.field.required && <span className="muted"> (required)</span>}
              </th>
              <td>{display(f)}</td>
              <td>
                <span className={`decision decision-${f.decidedBy}`}>{f.decidedBy ? DECISION_LABEL[f.decidedBy] : ''}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {leftEmpty.length > 0 && (
        <details>
          <summary>Left empty ({leftEmpty.length} optional)</summary>
          <ul>
            {leftEmpty.map((f) => (
              <li key={f.field.id}>
                <button type="button" className="link" onClick={() => void runner?.focus(f.field.id)}>
                  {f.field.label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function display(f: FieldState): string {
  if (f.decidedBy === 'skipped') return '—';
  const v = f.finalValue ?? f.field.value;
  if (f.field.kind === 'checkbox') return v === 'true' ? 'Ticked' : 'Not ticked';
  return v.length > 120 ? `${v.slice(0, 117)}…` : v;
}
