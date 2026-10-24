import { useEffect, useState } from 'react';
import { deleteAnswer, listAnswers, updateAnswer, type SavedAnswer } from '../../shared/memory/answers';

/** Spec 09 R-AM-7: saved answers, editable and deletable. */
export function SavedAnswers() {
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const reload = async () => setAnswers((await listAnswers().catch(() => [])).sort((a, b) => b.lastUsed - a.lastUsed));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once when the section opens
    void reload();
  }, []);

  if (!answers.length) return null;
  return (
    <fieldset>
      <legend>Saved answers ({answers.length})</legend>
      <p className="muted">Lazy Apply suggests these when a similar question comes up. Sensitive ones still ask first.</p>
      <ul className="saved-answers">
        {answers.map((a) => (
          <li key={a.normalizedKey}>
            <p>
              <strong>{a.questionText}</strong>{' '}
              <span className="muted">
                used {a.usedCount} {a.usedCount === 1 ? 'time' : 'times'}
              </span>
            </p>
            {editing === a.normalizedKey ? (
              <div className="inline">
                <label className="field">
                  <span className="sr-only">Answer to {a.questionText}</span>
                  <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="primary"
                  onClick={async () => {
                    await updateAnswer(a.normalizedKey, draft);
                    setEditing(null);
                    await reload();
                  }}
                >
                  Save
                </button>
              </div>
            ) : (
              <p className="proposal">{a.answer}</p>
            )}
            <div className="actions">
              {editing !== a.normalizedKey && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(a.normalizedKey);
                    setDraft(a.answer);
                  }}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                aria-label={`Delete saved answer to ${a.questionText}`}
                onClick={async () => {
                  await deleteAnswer(a.normalizedKey);
                  await reload();
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
