import type { Conflict, Experience, Profile, Sourced } from './schema';

type ScalarPath = readonly ['identity' | 'contact' | 'links', string];

const SCALAR_PATHS: readonly ScalarPath[] = [
  ['identity', 'fullName'],
  ['identity', 'firstName'],
  ['identity', 'lastName'],
  ['identity', 'pronouns'],
  ['contact', 'email'],
  ['contact', 'phone'],
  ['contact', 'city'],
  ['contact', 'region'],
  ['contact', 'country'],
  ['contact', 'postalCode'],
  ['links', 'linkedin'],
  ['links', 'github'],
  ['links', 'portfolio'],
  ['links', 'website'],
];

function normalize(path: string, value: string): string {
  let v = value.trim().toLowerCase();
  if (path.startsWith('links.')) v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  if (path === 'contact.phone') v = v.replace(/\D/g, '');
  return v.replace(/\s+/g, ' ');
}

const filled = (s: Sourced<string> | undefined): s is Sourced<string> => !!s && s.value.trim() !== '';

const normCompany = (name: string) =>
  name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|gmbh|corp|corporation|co|plc|limited)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');

function years(e: Experience): [number, number] | undefined {
  const start = /\d{4}/.exec(e.start)?.[0];
  if (!start) return undefined;
  const end = /present|current|now/i.test(e.end) ? '9999' : /\d{4}/.exec(e.end)?.[0];
  return [Number(start), Number(end ?? start)];
}

function sameJob(a: Experience, b: Experience): boolean {
  if (normCompany(a.company) !== normCompany(b.company)) return false;
  const ya = years(a);
  const yb = years(b);
  if (!ya || !yb) return true;
  return ya[0] <= yb[1] && yb[0] <= ya[1];
}

/**
 * Spec 02 R-PI-7/R-PI-8: CV wins for contact and work history, LinkedIn fills gaps,
 * and differing non-empty values become conflicts for the user to resolve.
 */
export function mergeProfiles(cv: Profile | undefined, linkedin: Profile | undefined): { profile: Profile; conflicts: Conflict[] } {
  if (!cv && !linkedin) throw new Error('Nothing to merge');
  if (!cv) return { profile: linkedin as Profile, conflicts: [] };
  if (!linkedin) return { profile: cv, conflicts: [] };

  const profile = structuredClone(cv);
  const conflicts: Conflict[] = [];

  for (const [section, key] of SCALAR_PATHS) {
    const path = `${section}.${key}`;
    const target = profile[section] as Record<string, Sourced<string> | undefined>;
    const a = target[key];
    const b = (linkedin[section] as Record<string, Sourced<string> | undefined>)[key];
    if (!filled(b)) continue;
    if (!filled(a)) {
      target[key] = b;
    } else if (normalize(path, a.value) !== normalize(path, b.value)) {
      conflicts.push({ path, cvValue: a.value, linkedinValue: b.value });
    }
  }

  linkedin.experience.forEach((li) => {
    const index = profile.experience.findIndex((c) => sameJob(c.value, li.value));
    const match = profile.experience[index];
    if (!match) {
      profile.experience.push(li);
      return;
    }
    const c = match.value;
    if (!c.location && li.value.location) c.location = li.value.location;
    if (c.bullets.length === 0) c.bullets = li.value.bullets;
    if (li.value.title.trim() && c.title.trim().toLowerCase() !== li.value.title.trim().toLowerCase()) {
      conflicts.push({ path: `experience.${index}.title`, cvValue: c.title, linkedinValue: li.value.title });
    }
  });

  for (const li of linkedin.education) {
    const match = profile.education.find(
      (c) => normCompany(c.value.institution) === normCompany(li.value.institution),
    );
    if (!match) {
      profile.education.push(li);
      continue;
    }
    for (const k of ['degree', 'field', 'start', 'end', 'grade'] as const) {
      if (!match.value[k] && li.value[k]) match.value[k] = li.value[k];
    }
  }

  const union = <T>(into: Sourced<T>[], from: Sourced<T>[], key: (v: T) => string) => {
    const seen = new Set(into.map((x) => key(x.value).toLowerCase()));
    for (const item of from) {
      if (!seen.has(key(item.value).toLowerCase())) {
        into.push(item);
        seen.add(key(item.value).toLowerCase());
      }
    }
  };
  union(profile.skills, linkedin.skills, (s) => s.trim());
  union(profile.languages, linkedin.languages, (l) => l.name.trim());
  union(profile.certifications, linkedin.certifications, (c) => c.name.trim());
  union(profile.links.other, linkedin.links.other, (l) => l.url.trim());

  return { profile, conflicts };
}

export type ConflictChoice = { pick: 'cv' | 'linkedin' } | { custom: string };

export function resolveConflict(
  profile: Profile,
  conflicts: readonly Conflict[],
  path: string,
  choice: ConflictChoice,
): { profile: Profile; conflicts: Conflict[] } {
  const conflict = conflicts.find((c) => c.path === path);
  if (!conflict) return { profile, conflicts: [...conflicts] };
  const next = structuredClone(profile);
  const [value, source] =
    'custom' in choice
      ? [choice.custom, 'user' as const]
      : choice.pick === 'cv'
        ? [conflict.cvValue, 'cv' as const]
        : [conflict.linkedinValue, 'linkedin' as const];

  const [section, keyOrIndex, field] = path.split('.');
  if (section === 'experience' && field) {
    const entry = next.experience[Number(keyOrIndex)];
    if (entry) {
      (entry.value as unknown as Record<string, string>)[field] = value;
      if (source === 'user') entry.source = 'user';
    }
  } else if (section && keyOrIndex) {
    (next[section as 'identity' | 'contact' | 'links'] as Record<string, Sourced<string>>)[keyOrIndex] = { value, source };
  }
  return { profile: next, conflicts: conflicts.filter((c) => c.path !== path) };
}
