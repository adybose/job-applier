import { useState } from 'react';
import type { Card, RunState } from '../../shared/agent/machine';
import type { Runner } from './runner';

/** Spec 06 R-HL-9: handoffs and required questions first, then approvals, each in page order. */
export function sortCards(state: RunState): Card[] {
  const rank = (c: Card) => {
    const required = state.fields[c.id]?.field.required ?? true;
    // "Go to the next step?" always comes last, after everything on this step.
    if (c.nav) return 3;
    if (c.type === 'handoff') return 0;
    if (c.type === 'question' && required) return 1;
    return 2;
  };
  const position = (c: Card) => {
    const i = state.order.indexOf(c.id);
    return i === -1 ? -1 : i;
  };
  return [...state.cards].sort((a, b) => rank(a) - rank(b) || position(a) - position(b));
}

export function CardList({ state, runner }: { state: RunState; runner: Runner | null }) {
  const cards = sortCards(state);
  if (!cards.length || !runner) return null;
  return (
    <section aria-labelledby="cards-title" className="cards">
      <h3 id="cards-title">
        {cards.length} {cards.length === 1 ? 'thing needs' : 'things need'} you
      </h3>
      <ul>
        {cards.map((card) => (
          // A re-routed card (new proposal) gets a new createdAt, so its local edit state starts fresh.
          <li key={`${card.id}-${card.createdAt}`}>
            {card.nav ? (
              <NavCard card={card} runner={runner} />
            ) : card.type === 'handoff' ? (
              <HandoffCard card={card} runner={runner} />
            ) : (
              <AnswerCard card={card} state={state} runner={runner} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NavCard({ card, runner }: { card: Card; runner: Runner }) {
  const [busy, setBusy] = useState(false);
  return (
    <article className="card card-approval" aria-labelledby={`card-${card.id}`}>
      <p className="card-kind">Next step</p>
      <h4 id={`card-${card.id}`}>{card.label}</h4>
      <p>{card.reason}</p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await runner.answer(card.id, '', false);
            setBusy(false);
          }}
        >
          Approve and go to the next step
        </button>
        <button type="button" disabled={busy} onClick={() => void runner.resolve(card.id, 'skipped')}>
          Not yet
        </button>
      </div>
    </article>
  );
}

function HandoffCard({ card, runner }: { card: Card; runner: Runner }) {
  return (
    <article className="card card-handoff" aria-labelledby={`card-${card.id}`}>
      <p className="card-kind">Your turn</p>
      <h4 id={`card-${card.id}`}>
        <button type="button" className="link" onClick={() => void runner.focus(card.id)}>
          {card.label}
        </button>
      </h4>
      <p>{card.instruction ?? card.reason}</p>
      {card.instruction && card.reason && card.reason !== card.instruction && <p className="muted">{card.reason}</p>}
      <p className="muted">Lazy Apply keeps going and notices when you're done.</p>
      <div className="actions">
        <button type="button" className="primary" onClick={() => void runner.resolve(card.id, 'human')}>
          I did it
        </button>
        <button type="button" onClick={() => void runner.resolve(card.id, 'skipped')}>
          Skip
        </button>
      </div>
    </article>
  );
}

/** Approval and question cards (spec 06 R-HL-1..R-HL-4). */
function AnswerCard({ card, state, runner }: { card: Card; state: RunState; runner: Runner }) {
  const fs = state.fields[card.id];
  const field = fs?.field;
  const proposed = card.proposal?.value ?? '';
  const [value, setValue] = useState(proposed);
  const [editing, setEditing] = useState(card.type === 'question' || !proposed);
  const [busy, setBusy] = useState(false);
  const sensitive = !!fs?.category;
  const [remember, setRemember] = useState(!sensitive);
  const isDraft = card.proposal?.origin === 'draft';
  const options = field?.options?.length ? field.options : field?.kind === 'checkbox' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : undefined;

  async function submit(edited: boolean) {
    setBusy(true);
    const ok = await runner.answer(card.id, value, edited);
    if (ok && remember && field) await runner.remember(field, value);
    setBusy(false);
  }

  async function regenerate() {
    setBusy(true);
    const p = await runner.regenerate(card.id);
    if (p) setValue(p.value);
    setBusy(false);
  }

  const edited = value !== proposed;
  return (
    <article className={`card card-${card.type}`} aria-labelledby={`card-${card.id}`}>
      <p className="card-kind">{card.type === 'question' ? 'Question' : 'Check this'}</p>
      <h4 id={`card-${card.id}`}>
        <button type="button" className="link" onClick={() => void runner.focus(card.id)}>
          {card.label}
        </button>
      </h4>
      {field?.section && <p className="muted">{field.section}</p>}
      {field?.helpText && <p className="muted">{field.helpText}</p>}
      <p className="muted">{card.reason}</p>
      {card.proposal?.rationale && !editing && <p className="muted">Why: {card.proposal.rationale}</p>}

      {editing ? (
        options ? (
          <label className="field">
            <span className="sr-only">Answer for {card.label}</span>
            <select value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Choose…</option>
              {options.map((o) => (
                <option key={o.value + o.label} value={field?.kind === 'checkbox' ? o.value : o.label}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span className="sr-only">Answer for {card.label}</span>
            {isDraft || field?.kind === 'textarea' || field?.kind === 'contenteditable' ? (
              <textarea rows={6} value={value} maxLength={field?.constraints.maxLength} onChange={(e) => setValue(e.target.value)} />
            ) : (
              <input value={value} onChange={(e) => setValue(e.target.value)} />
            )}
          </label>
        )
      ) : (
        <p className="proposal">{field?.kind === 'checkbox' ? (/true/i.test(proposed) ? 'Yes (tick the box)' : 'No') : proposed}</p>
      )}
      {field?.constraints.maxLength && (isDraft || editing) && (
        <p className="muted">
          {value.length} / {field.constraints.maxLength} characters
        </p>
      )}

      <label className="checkbox">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember this answer
      </label>
      <div className="actions">
        <button type="button" className="primary" disabled={busy || !value.trim()} onClick={() => void submit(edited)}>
          {card.type === 'question' ? 'Use this answer' : edited ? 'Approve edit' : 'Approve'}
        </button>
        {!editing && (
          <button type="button" disabled={busy} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {isDraft && (
          <button type="button" disabled={busy} onClick={() => void regenerate()}>
            Regenerate
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void runner.resolve(card.id, 'skipped')}>
          Skip
        </button>
      </div>
    </article>
  );
}
