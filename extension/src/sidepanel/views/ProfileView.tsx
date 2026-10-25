import { useEffect, useState } from 'react';
import { createModelClient } from '../../shared/model';
import { loadModelSettings } from '../../shared/model/settings';
import { ingestFiles } from '../../shared/profile/ingest';
import { resolveConflict, type ConflictChoice } from '../../shared/profile/merge';
import type { Profile } from '../../shared/profile/schema';
import { loadDraft, loadProfile, saveDraft, saveProfile, type ProfileDraft } from '../../shared/profile/storage';
import { ProfileEditor } from '../components/ProfileEditor';
import { SavedAnswers } from '../components/SavedAnswers';
import { getDocument, renderPages } from '../pdfjs';

export function ProfileView({ onSaved }: { onSaved: () => void }) {
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const [savedDraft, saved] = await Promise.all([loadDraft(), loadProfile()]);
      if (savedDraft) setDraft(savedDraft);
      else if (saved) setDraft({ profile: saved, conflicts: [], errors: [] });
      setHasSaved(!!saved);
      setLoading(false);
    })();
  }, []);

  function update(next: ProfileDraft) {
    setDraft(next);
    setMessage(null);
    void saveDraft(next);
  }

  async function save() {
    if (!draft) return;
    const result = await saveProfile(draft.profile, draft.conflicts);
    if (result.ok) {
      setHasSaved(true);
      setDraft({ ...draft, errors: [] });
      setMessage({ kind: 'ok', text: 'Profile saved.' });
      onSaved();
    } else {
      setMessage({ kind: 'error', text: result.error });
    }
  }

  if (loading) return <p role="status">Loading…</p>;

  return (
    <section aria-labelledby="profile-title">
      <h2 id="profile-title">Your profile</h2>
      {(!draft || showUpload) && (
        <UploadForm
          onDone={(next) => {
            update(next);
            setShowUpload(false);
          }}
        />
      )}
      {draft && !showUpload && (
        <>
          <div className="actions">
            <button type="button" onClick={() => setShowUpload(true)}>
              Read new files
            </button>
          </div>
          {draft.errors.map((e) => (
            <p key={e} role="alert" className="error">
              {e}
            </p>
          ))}
          <ProfileEditor
            profile={draft.profile}
            conflicts={draft.conflicts}
            onChange={(profile: Profile) => update({ ...draft, profile })}
            onResolve={(path: string, choice: ConflictChoice) =>
              update({ ...draft, ...resolveConflict(draft.profile, draft.conflicts, path, choice) })
            }
          />
          <SavedAnswers />
          <div className="actions sticky-actions">
            <button type="button" className="primary" onClick={save}>
              Save profile
            </button>
            {hasSaved && <span className="muted">Saved profiles are used for every application.</span>}
          </div>
        </>
      )}
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'error' : 'muted'}>
          {message.text}
        </p>
      )}
    </section>
  );
}

function UploadForm({ onDone }: { onDone: (draft: ProfileDraft) => void }) {
  const [cv, setCv] = useState<File | undefined>();
  const [linkedin, setLinkedin] = useState<File | undefined>();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    setError(null);
    setProgress('Starting…');
    try {
      const settings = await loadModelSettings();
      const draft = await ingestFiles(
        { cv, linkedin },
        {
          client: createModelClient(settings),
          numCtx: settings.mapping.numCtx,
          getDocument,
          renderPages,
          onProgress: setProgress,
        },
      );
      onDone(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="upload">
      <p>Add your CV, your LinkedIn PDF, or both. They are read on this computer and never uploaded.</p>
      <label className="field">
        <span>Your CV (PDF, up to 10 MB)</span>
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => setCv(e.target.files?.[0])} />
      </label>
      <label className="field">
        <span>Your LinkedIn profile PDF</span>
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => setLinkedin(e.target.files?.[0])} />
      </label>
      <p className="muted">On LinkedIn, open your profile, click More, then Save to PDF.</p>
      <div className="actions">
        <button type="button" className="primary" onClick={read} disabled={(!cv && !linkedin) || progress !== null}>
          {progress ? 'Reading…' : 'Read my files'}
        </button>
      </div>
      {progress && <p role="status">{progress}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
