import { useState, type ReactNode } from 'react';
import type { ConflictChoice } from '../../shared/profile/merge';
import type { Conflict, Education, Experience, Profile, Source, Sourced } from '../../shared/profile/schema';

interface Props {
  profile: Profile;
  conflicts: Conflict[];
  onChange: (profile: Profile) => void;
  onResolve: (path: string, choice: ConflictChoice) => void;
}

const user = <T,>(value: T): Sourced<T> => ({ value, source: 'user' });

/** Spec 02 R-PI-14: every field editable, with its source, conflicts first. */
export function ProfileEditor({ profile, conflicts, onChange, onResolve }: Props) {
  const edit = (mutate: (p: Profile) => void) => {
    const next = structuredClone(profile);
    mutate(next);
    onChange(next);
  };

  const text = (
    label: string,
    value: Sourced<string> | undefined,
    set: (p: Profile, v: Sourced<string> | undefined) => void,
    type = 'text',
  ) => (
    <Row label={label} source={value?.source}>
      <input
        type={type}
        value={value?.value ?? ''}
        onChange={(e) => edit((p) => set(p, e.target.value ? user(e.target.value) : undefined))}
      />
    </Row>
  );

  return (
    <div className="profile-editor">
      {conflicts.length > 0 && (
        <fieldset className="conflicts">
          <legend>Choose between your CV and LinkedIn ({conflicts.length})</legend>
          {conflicts.map((c) => (
            <ConflictRow key={c.path} conflict={c} onResolve={onResolve} />
          ))}
        </fieldset>
      )}

      <fieldset>
        <legend>About you</legend>
        {text('Full name', profile.identity.fullName, (p, v) => (p.identity.fullName = v ?? user('')))}
        {text('First name', profile.identity.firstName, (p, v) => (p.identity.firstName = v ?? user('')))}
        {text('Last name', profile.identity.lastName, (p, v) => (p.identity.lastName = v ?? user('')))}
        {text('Preferred name', profile.identity.preferredName, (p, v) => (p.identity.preferredName = v))}
        {text('Pronouns (optional)', profile.identity.pronouns, (p, v) => (p.identity.pronouns = v))}
      </fieldset>

      <fieldset>
        <legend>Contact</legend>
        {text('Email', profile.contact.email, (p, v) => (p.contact.email = v ?? user('')), 'email')}
        {text('Phone', profile.contact.phone, (p, v) => (p.contact.phone = v ?? user('')), 'tel')}
        {text('City', profile.contact.city, (p, v) => (p.contact.city = v ?? user('')))}
        {text('State or region', profile.contact.region, (p, v) => (p.contact.region = v))}
        {text('Country', profile.contact.country, (p, v) => (p.contact.country = v ?? user('')))}
        {text('Postal code', profile.contact.postalCode, (p, v) => (p.contact.postalCode = v))}
      </fieldset>

      <fieldset>
        <legend>Links</legend>
        {text('LinkedIn', profile.links.linkedin, (p, v) => (p.links.linkedin = v), 'url')}
        {text('GitHub', profile.links.github, (p, v) => (p.links.github = v), 'url')}
        {text('Portfolio', profile.links.portfolio, (p, v) => (p.links.portfolio = v), 'url')}
        {text('Website', profile.links.website, (p, v) => (p.links.website = v), 'url')}
      </fieldset>

      <fieldset>
        <legend>Work preferences</legend>
        <Row label="Do you need visa sponsorship?" source={profile.sponsorshipNeeded.source}>
          <TriState value={profile.sponsorshipNeeded.value} onChange={(v) => edit((p) => (p.sponsorshipNeeded = user(v)))} />
        </Row>
        <WorkAuthorization profile={profile} edit={edit} />
        {text('Notice period', profile.noticePeriod, (p, v) => (p.noticePeriod = v))}
        {text('Earliest start date', profile.earliestStartDate, (p, v) => (p.earliestStartDate = v), 'date')}
        <Salary profile={profile} edit={edit} />
        <Row label="Willing to relocate?" source={profile.relocation.source}>
          <TriState
            value={profile.relocation.value.willing}
            onChange={(willing) => edit((p) => (p.relocation = user({ ...p.relocation.value, willing })))}
          />
        </Row>
        <Row label="Remote preference" source={profile.remotePreference.source}>
          <select
            value={profile.remotePreference.value ?? ''}
            onChange={(e) =>
              edit((p) => (p.remotePreference = user((e.target.value || null) as Profile['remotePreference']['value'])))
            }
          >
            <option value="">Not set</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
            <option value="any">Any</option>
          </select>
        </Row>
      </fieldset>

      <fieldset>
        <legend>Experience</legend>
        {profile.experience.map((entry, i) => (
          <ExperienceEntry
            key={i}
            entry={entry}
            onChange={(value) => edit((p) => (p.experience[i] = user(value)))}
            onRemove={() => edit((p) => p.experience.splice(i, 1))}
          />
        ))}
        <button
          type="button"
          onClick={() =>
            edit((p) =>
              p.experience.push(user({ company: '', title: '', start: '', end: '', location: null, bullets: [] })),
            )
          }
        >
          Add a job
        </button>
      </fieldset>

      <fieldset>
        <legend>Education</legend>
        {profile.education.map((entry, i) => (
          <EducationEntry
            key={i}
            entry={entry}
            onChange={(value) => edit((p) => (p.education[i] = user(value)))}
            onRemove={() => edit((p) => p.education.splice(i, 1))}
          />
        ))}
        <button
          type="button"
          onClick={() =>
            edit((p) =>
              p.education.push(
                user({ institution: '', degree: null, field: null, start: null, end: null, grade: null }),
              ),
            )
          }
        >
          Add a school
        </button>
      </fieldset>

      <fieldset>
        <legend>Skills and languages</legend>
        <ListField
          label="Skills (comma-separated)"
          items={profile.skills}
          toText={(s) => s}
          fromText={(s) => s}
          onChange={(skills) => edit((p) => (p.skills = skills))}
        />
        <ListField
          label="Languages (comma-separated, level in brackets)"
          items={profile.languages}
          toText={(l) => (l.level ? `${l.name} (${l.level})` : l.name)}
          fromText={(s) => {
            const m = /^(.*?)\s*\((.*)\)\s*$/.exec(s);
            return m ? { name: m[1] ?? s, level: m[2] ?? null } : { name: s, level: null };
          }}
          onChange={(languages) => edit((p) => (p.languages = languages))}
        />
        <ListField
          label="Certifications (comma-separated)"
          items={profile.certifications}
          toText={(c) => c.name}
          fromText={(name) => ({ name, issuer: null, year: null })}
          onChange={(certifications) => edit((p) => (p.certifications = certifications))}
        />
      </fieldset>
    </div>
  );
}

const SOURCE_LABEL: Record<Source, string> = { cv: 'from CV', linkedin: 'from LinkedIn', user: 'you' };

function Row({ label, source, children }: { label: string; source?: Source; children: ReactNode }) {
  return (
    <label className="field">
      <span>
        {label} {source && <span className={`badge badge-${source}`}>{SOURCE_LABEL[source]}</span>}
      </span>
      {children}
    </label>
  );
}

function TriState({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <select
      value={value === null ? '' : value ? 'yes' : 'no'}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'yes')}
    >
      <option value="">Not set</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

function ConflictRow({ conflict, onResolve }: { conflict: Conflict; onResolve: Props['onResolve'] }) {
  const [custom, setCustom] = useState('');
  const name = `conflict-${conflict.path}`;
  return (
    <div className="conflict" role="group" aria-label={labelForPath(conflict.path)}>
      <p>
        <strong>{labelForPath(conflict.path)}</strong>
      </p>
      <button type="button" onClick={() => onResolve(conflict.path, { pick: 'cv' })}>
        Use CV: {conflict.cvValue}
      </button>
      <button type="button" onClick={() => onResolve(conflict.path, { pick: 'linkedin' })}>
        Use LinkedIn: {conflict.linkedinValue}
      </button>
      <div className="inline">
        <input
          type="text"
          aria-label={`Something else for ${labelForPath(conflict.path)}`}
          placeholder="Something else"
          name={name}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <button type="button" disabled={!custom.trim()} onClick={() => onResolve(conflict.path, { custom: custom.trim() })}>
          Use this
        </button>
      </div>
    </div>
  );
}

function labelForPath(path: string): string {
  const parts = path.split('.');
  if (parts[0] === 'experience') return `Job title (job ${Number(parts[1]) + 1})`;
  const key = parts[1] ?? path;
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function ExperienceEntry(props: { entry: Sourced<Experience>; onChange: (v: Experience) => void; onRemove: () => void }) {
  const { entry, onChange, onRemove } = props;
  const v = entry.value;
  const name = v.company || 'New job';
  return (
    <div className="entry" role="group" aria-label={name}>
      <p className="entry-title">
        <strong>{name}</strong> <span className={`badge badge-${entry.source}`}>{SOURCE_LABEL[entry.source]}</span>
      </p>
      <label className="field">
        <span>Company</span>
        <input value={v.company} onChange={(e) => onChange({ ...v, company: e.target.value })} />
      </label>
      <label className="field">
        <span>Title</span>
        <input value={v.title} onChange={(e) => onChange({ ...v, title: e.target.value })} />
      </label>
      <div className="inline">
        <label className="field">
          <span>Start</span>
          <input value={v.start} placeholder="YYYY-MM" onChange={(e) => onChange({ ...v, start: e.target.value })} />
        </label>
        <label className="field">
          <span>End</span>
          <input value={v.end} placeholder="YYYY-MM or present" onChange={(e) => onChange({ ...v, end: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Location</span>
        <input value={v.location ?? ''} onChange={(e) => onChange({ ...v, location: e.target.value || null })} />
      </label>
      <label className="field">
        <span>What you did (one per line)</span>
        <textarea
          rows={Math.max(2, v.bullets.length + 1)}
          value={v.bullets.join('\n')}
          onChange={(e) => onChange({ ...v, bullets: e.target.value.split('\n') })}
          onBlur={(e) => onChange({ ...v, bullets: e.target.value.split('\n').filter((b) => b.trim()) })}
        />
      </label>
      <button type="button" onClick={onRemove}>
        Remove {name}
      </button>
    </div>
  );
}

function EducationEntry(props: { entry: Sourced<Education>; onChange: (v: Education) => void; onRemove: () => void }) {
  const { entry, onChange, onRemove } = props;
  const v = entry.value;
  const name = v.institution || 'New school';
  const opt = (key: 'degree' | 'field' | 'start' | 'end' | 'grade', label: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={v[key] ?? ''} onChange={(e) => onChange({ ...v, [key]: e.target.value || null })} />
    </label>
  );
  return (
    <div className="entry" role="group" aria-label={name}>
      <p className="entry-title">
        <strong>{name}</strong> <span className={`badge badge-${entry.source}`}>{SOURCE_LABEL[entry.source]}</span>
      </p>
      <label className="field">
        <span>School</span>
        <input value={v.institution} onChange={(e) => onChange({ ...v, institution: e.target.value })} />
      </label>
      {opt('degree', 'Degree')}
      {opt('field', 'Field of study')}
      <div className="inline">
        {opt('start', 'Start')}
        {opt('end', 'End')}
      </div>
      {opt('grade', 'Grade')}
      <button type="button" onClick={onRemove}>
        Remove {name}
      </button>
    </div>
  );
}

function ListField<T>(props: {
  label: string;
  items: Sourced<T>[];
  toText: (v: T) => string;
  fromText: (s: string) => T;
  onChange: (items: Sourced<T>[]) => void;
}) {
  const { label, items, toText, fromText, onChange } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const current = items.map((i) => toText(i.value)).join(', ');

  function commit(text: string) {
    setDraft(null);
    const bySource = new Map(items.map((i) => [toText(i.value), i]));
    const next = text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => bySource.get(s) ?? user(fromText(s)));
    onChange(next);
  }

  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        rows={2}
        value={draft ?? current}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
      />
    </label>
  );
}

function WorkAuthorization({ profile, edit }: { profile: Profile; edit: (m: (p: Profile) => void) => void }) {
  return (
    <div className="entry" role="group" aria-label="Work authorization">
      <p className="entry-title">
        <strong>Where can you work without sponsorship?</strong>
      </p>
      {profile.workAuthorization.map((a, i) => (
        <div className="inline" key={i}>
          <label className="field">
            <span>Country</span>
            <input
              value={a.value.country}
              onChange={(e) => edit((p) => (p.workAuthorization[i] = user({ ...a.value, country: e.target.value })))}
            />
          </label>
          <label className="field">
            <span>Authorized?</span>
            <select
              value={a.value.authorized ? 'yes' : 'no'}
              onChange={(e) =>
                edit((p) => (p.workAuthorization[i] = user({ ...a.value, authorized: e.target.value === 'yes' })))
              }
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <button type="button" onClick={() => edit((p) => p.workAuthorization.splice(i, 1))}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          edit((p) => p.workAuthorization.push(user({ country: p.contact.country.value, authorized: true })))
        }
      >
        Add a country
      </button>
    </div>
  );
}

function Salary({ profile, edit }: { profile: Profile; edit: (m: (p: Profile) => void) => void }) {
  const s = profile.salaryExpectation.value;
  const set = (patch: Partial<typeof s>) => edit((p) => (p.salaryExpectation = user({ ...s, ...patch })));
  return (
    <div className="entry" role="group" aria-label="Salary expectation">
      <p className="entry-title">
        <strong>Salary expectation</strong>
      </p>
      <label className="checkbox">
        <input type="checkbox" checked={s.askEachTime} onChange={(e) => set({ askEachTime: e.target.checked })} />
        Ask me each time
      </label>
      {!s.askEachTime && (
        <div className="inline">
          <label className="field">
            <span>Amount</span>
            <input
              type="number"
              min={0}
              value={s.amount ?? ''}
              onChange={(e) => set({ amount: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
          <label className="field">
            <span>Currency</span>
            <input value={s.currency ?? ''} placeholder="USD" onChange={(e) => set({ currency: e.target.value || undefined })} />
          </label>
          <label className="field">
            <span>Per</span>
            <select
              value={s.period ?? 'year'}
              onChange={(e) => set({ period: e.target.value as 'year' | 'month' | 'hour' })}
            >
              <option value="year">Year</option>
              <option value="month">Month</option>
              <option value="hour">Hour</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
