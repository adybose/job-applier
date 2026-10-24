import { DEMOGRAPHIC, sensitiveCategory } from '../policy/sensitive';
import { bestOption, declineOption } from '../policy/options';
import type { Profile, Sourced } from '../profile/schema';
import type { Field } from '../snapshot';
import type { Proposal, ProposalAction } from './types';

// Spec 05 R-AL-3/R-AL-4: stage 1, no model. Maps fields straight from the profile.

export interface MapperContext {
  hasResume: boolean;
  hasLinkedinPdf: boolean;
}

type Getter = (p: Profile) => string | undefined;

const v = (s: Sourced<string> | undefined) => (s?.value.trim() ? s.value.trim() : undefined);
const current = (p: Profile) => p.experience.find((e) => /present|current|now/i.test(e.value.end)) ?? p.experience[0];

const GET = {
  firstName: (p: Profile) => v(p.identity.firstName),
  lastName: (p: Profile) => v(p.identity.lastName),
  fullName: (p: Profile) => v(p.identity.fullName) ?? ([v(p.identity.firstName), v(p.identity.lastName)].filter(Boolean).join(' ') || undefined),
  preferredName: (p: Profile) => v(p.identity.preferredName) ?? v(p.identity.firstName),
  pronouns: (p: Profile) => v(p.identity.pronouns),
  email: (p: Profile) => v(p.contact.email),
  phone: (p: Profile) => v(p.contact.phone),
  city: (p: Profile) => v(p.contact.city),
  region: (p: Profile) => v(p.contact.region),
  country: (p: Profile) => v(p.contact.country),
  postalCode: (p: Profile) => v(p.contact.postalCode),
  location: (p: Profile) => [v(p.contact.city), v(p.contact.region), v(p.contact.country)].filter(Boolean).join(', ') || undefined,
  linkedin: (p: Profile) => withScheme(v(p.links.linkedin)),
  github: (p: Profile) => withScheme(v(p.links.github)),
  portfolio: (p: Profile) => withScheme(v(p.links.portfolio) ?? v(p.links.website)),
  website: (p: Profile) => withScheme(v(p.links.website) ?? v(p.links.portfolio)),
  company: (p: Profile) => current(p)?.value.company || undefined,
  title: (p: Profile) => current(p)?.value.title || undefined,
  noticePeriod: (p: Profile) => v(p.noticePeriod),
  startDate: (p: Profile) => v(p.earliestStartDate),
} satisfies Record<string, Getter>;

function withScheme(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

const AUTOCOMPLETE: Record<string, Getter> = {
  'given-name': GET.firstName,
  'family-name': GET.lastName,
  name: GET.fullName,
  nickname: GET.preferredName,
  email: GET.email,
  tel: GET.phone,
  'tel-national': GET.phone,
  'address-level2': GET.city,
  'address-level1': GET.region,
  country: GET.country,
  'country-name': GET.country,
  'postal-code': GET.postalCode,
  organization: GET.company,
  'organization-title': GET.title,
};

// Labels about someone else (a referee, a manager) are never mapped from the user's own profile.
const NOT_ABOUT_YOU = /\b(refer(ence|ee|rer|ral)|recruiter|emergency|manager|supervisor|hiring|contact person|spouse)\b/i;

const LABELS: readonly [RegExp, Getter][] = [
  [/^(legal )?first name$|^given name|^forename/i, GET.firstName],
  [/^(legal )?(last|family) name$|^surname/i, GET.lastName],
  [/^preferred (first )?name|^nickname/i, GET.preferredName],
  [/^(your |full |full legal |legal )?name$/i, GET.fullName],
  [/^pronouns?/i, GET.pronouns],
  [/e-?mail/i, GET.email],
  [/phone|mobile|telephone|cell/i, GET.phone],
  [/linked ?in/i, GET.linkedin],
  [/github/i, GET.github],
  [/portfolio/i, GET.portfolio],
  [/^(personal )?(website|web site|blog|homepage)|other (website|url|link)|^website/i, GET.website],
  [/^city\b|current city|city of residence|town/i, GET.city],
  [/^(current )?location\b|where are you (currently )?(located|based)|^address$/i, GET.location],
  [/^country/i, GET.country],
  [/^(state|province|region|county)\b/i, GET.region],
  [/zip|postal|post ?code/i, GET.postalCode],
  [/current (company|employer)|^(company|employer|organi[sz]ation)( name)?$/i, GET.company],
  [/current (job )?(title|role|position)|^(job )?title$/i, GET.title],
  [/notice period/i, GET.noticePeriod],
  [/(earliest|available|availability).*(start|date)|start date|when can you start/i, GET.startDate],
];

const RESUME = /\b(resume|résumé|cv|curriculum vitae)\b/i;

function actionFor(field: Field): ProposalAction | undefined {
  switch (field.kind) {
    case 'select':
    case 'radio-group':
    case 'combobox':
      return 'select_option';
    case 'checkbox':
    case 'password':
    case 'unknown':
      return undefined;
    case 'file':
      return 'upload_file';
    default:
      return 'fill';
  }
}

function proposal(field: Field, action: ProposalAction, value: string, rationale: string, extra: Partial<Proposal> = {}): Proposal {
  return { fieldId: field.id, action, value, confidence: 1, rationale, sensitive: false, origin: 'mapper', ...extra };
}

const yesNo = (b: boolean) => (b ? 'Yes' : 'No');

function normalizeCountry(s: string): string {
  const c = s.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (/^(us|usa|united states( of america)?|america)$/.test(c)) return 'united states';
  if (/^(uk|gb|great britain|united kingdom|britain|england)$/.test(c)) return 'united kingdom';
  return c;
}

/** Yes/No questions the profile answers directly. They are sensitive, so the policy sends them for approval. */
function mapPreference(field: Field, p: Profile): Proposal | undefined {
  const label = field.label;
  if (/sponsor/i.test(label) && p.sponsorshipNeeded.value !== null) {
    return proposal(field, 'select_option', yesNo(p.sponsorshipNeeded.value), 'From your profile: visa sponsorship.');
  }
  const auth = /authori[sz]ed to work|eligible to work|right to work|legally (able|permitted) to work/i.test(label)
    ? /\b(?:in|for) (?:the )?([A-Z][\w .]+?)\??$/i.exec(label)?.[1]
    : undefined;
  if (auth !== undefined) {
    const entry = p.workAuthorization.find((a) => normalizeCountry(a.value.country) === normalizeCountry(auth));
    if (entry) return proposal(field, 'select_option', yesNo(entry.value.authorized), `From your profile: work authorization in ${entry.value.country}.`);
    return undefined;
  }
  if (/relocat/i.test(label) && p.relocation.value.willing !== null) {
    return proposal(field, 'select_option', yesNo(p.relocation.value.willing), 'From your profile: relocation.');
  }
  return undefined;
}

function mapSalary(field: Field, p: Profile): Proposal | undefined {
  const s = p.salaryExpectation.value;
  if (s.askEachTime || s.amount === undefined) {
    return proposal(field, 'ask', '', 'You asked to be asked about salary each time.', { confidence: 0 });
  }
  const value =
    field.kind === 'number'
      ? String(s.amount)
      : `${s.amount.toLocaleString('en-US')}${s.currency ? ` ${s.currency}` : ''}${s.period ? ` per ${s.period}` : ''}`;
  return proposal(field, 'fill', value, 'From your profile: salary expectation.');
}

/** Stage 1 for one field. Returns undefined when the mapper has no confident answer. */
export function mapField(field: Field, profile: Profile, ctx: MapperContext): Proposal | undefined {
  const action = actionFor(field);
  if (!action) return undefined;
  const category = sensitiveCategory(field);

  // R-AL-13: demographic questions default to "decline" (and always go to approval).
  if (category && DEMOGRAPHIC.has(category)) {
    const decline = field.options ? declineOption(field.options) : undefined;
    if (decline && action === 'select_option') {
      return proposal(field, action, decline.label, 'Demographic questions default to "decline to self-identify".');
    }
    if (field.kind === 'combobox') {
      return proposal(field, action, 'Decline to self-identify', 'Demographic questions default to "decline to self-identify".', {
        confidence: 0.6,
      });
    }
    return undefined;
  }
  if (category === 'salary') return mapSalary(field, profile);
  if (category === 'work-authorization' || /relocat/i.test(field.label)) return mapPreference(field, profile);

  if (field.kind === 'file') {
    if (!RESUME.test(field.label) && !RESUME.test(field.name ?? '')) return undefined;
    if (ctx.hasResume) return proposal(field, 'upload_file', 'resume', 'Your CV from your profile.');
    if (ctx.hasLinkedinPdf) {
      return proposal(field, 'upload_file', 'linkedin', 'You only added a LinkedIn PDF.', { usesLinkedinPdf: true });
    }
    return undefined;
  }

  if (NOT_ABOUT_YOU.test(field.label)) return undefined;
  const autocompleteToken = field.autocomplete?.trim().split(/\s+/).at(-1)?.toLowerCase();
  const getter = (autocompleteToken && AUTOCOMPLETE[autocompleteToken]) || LABELS.find(([re]) => re.test(field.label))?.[1];
  const value = getter?.(profile);
  if (!value) return undefined;

  if (action === 'select_option') {
    // A select is only mapped when one of its options really matches.
    if (field.options) {
      const match = bestOption(field.options, value) ?? bestOption(field.options, normalizeCountry(value));
      if (!match) return undefined;
      return proposal(field, action, match.label, 'From your profile.');
    }
    return proposal(field, action, value, 'From your profile.');
  }
  return proposal(field, action, value, 'From your profile.');
}
