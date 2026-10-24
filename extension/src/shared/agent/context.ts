import type { Profile } from '../profile/schema';

// Spec 07 R-MR-10: prompt inputs trimmed to a character budget (tokens ≈ chars / 3.5).

const line = (label: string, value: string | undefined | null) => (value ? `${label}: ${value}\n` : '');

function preferences(p: Profile): string {
  const auth = p.workAuthorization.map((a) => `${a.value.country}: ${a.value.authorized ? 'authorized' : 'not authorized'}`).join('; ');
  const s = p.salaryExpectation.value;
  const salary = s.askEachTime || s.amount === undefined ? 'ask the user' : `${s.amount} ${s.currency ?? ''} per ${s.period ?? 'year'}`;
  const bool = (b: boolean | null) => (b === null ? undefined : b ? 'yes' : 'no');
  return (
    line('Work authorization', auth) +
    line('Needs visa sponsorship', bool(p.sponsorshipNeeded.value)) +
    line('Willing to relocate', bool(p.relocation.value.willing)) +
    line('Remote preference', p.remotePreference.value) +
    line('Notice period', p.noticePeriod?.value) +
    line('Earliest start date', p.earliestStartDate?.value) +
    line('Salary expectation', salary)
  );
}

/** The profile as compact text, dropping the oldest job bullets first until it fits maxChars. */
export function profileText(p: Profile, maxChars: number): string {
  const head =
    line('Name', p.identity.fullName.value) +
    line('Preferred name', p.identity.preferredName?.value) +
    line('Email', p.contact.email.value) +
    line('Phone', p.contact.phone.value) +
    line('Location', [p.contact.city.value, p.contact.region?.value, p.contact.country.value].filter(Boolean).join(', ')) +
    line('LinkedIn', p.links.linkedin?.value) +
    line('GitHub', p.links.github?.value) +
    line('Portfolio', p.links.portfolio?.value) +
    line('Website', p.links.website?.value) +
    preferences(p);
  const education = p.education
    .map((e) => `- ${[e.value.degree, e.value.field].filter(Boolean).join(', ')} at ${e.value.institution} (${[e.value.start, e.value.end].filter(Boolean).join('–')})`)
    .join('\n');
  const tail =
    (education ? `Education:\n${education}\n` : '') +
    line('Skills', p.skills.map((s) => s.value).join(', ')) +
    line('Languages', p.languages.map((l) => (l.value.level ? `${l.value.name} (${l.value.level})` : l.value.name)).join(', ')) +
    line('Certifications', p.certifications.map((c) => c.value.name).join(', ')) +
    (Object.keys(p.custom).length
      ? `Saved answers:\n${Object.entries(p.custom)
          .map(([q, a]) => `- ${q}: ${a.value}`)
          .join('\n')}\n`
      : '');

  const jobs = p.experience.map((e) => ({ ...e.value, bullets: [...e.value.bullets] }));
  const render = () =>
    head +
    (jobs.length
      ? `Experience:\n${jobs
          .map(
            (j) =>
              `- ${j.title} at ${j.company} (${j.start}–${j.end}${j.location ? `, ${j.location}` : ''})${j.bullets.map((b) => `\n  • ${b}`).join('')}`,
          )
          .join('\n')}\n`
      : '') +
    tail;

  let text = render();
  // Oldest jobs lose bullets first, one at a time.
  for (let i = jobs.length - 1; text.length > maxChars && i >= 0; i--) {
    const job = jobs[i];
    while (job && job.bullets.length && text.length > maxChars) {
      job.bullets.pop();
      text = render();
    }
  }
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/** Job description trimmed from the tail. */
export function jobDescriptionText(jd: string | undefined, maxChars: number): string {
  if (!jd) return '(no job description found)';
  return jd.length > maxChars ? `${jd.slice(0, maxChars)}…` : jd;
}

export const charsFor = (tokens: number) => Math.floor(tokens * 3.5);
