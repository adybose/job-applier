import type { Field } from '../snapshot';

// Spec 05 R-AL-12: code-side sensitivity classifier. Order matters: the first match names the category.
export type SensitiveCategory =
  | 'salary'
  | 'work-authorization'
  | 'eeo'
  | 'disability'
  | 'veteran'
  | 'criminal'
  | 'references'
  | 'legal'
  | 'age';

const RULES: readonly [SensitiveCategory, RegExp][] = [
  ['salary', /\b(salary|salaries|compensation|remuneration|pay (range|expectations?)|desired pay|expected pay|hourly rate|day rate|ctc|wage)\b/i],
  [
    'work-authorization',
    /\b(sponsor(ship)?|visa|work (authori[sz]ation|permit)|authori[sz]ed to work|right to work|legally (able|eligible|authori[sz]ed|permitted)|citizenship|immigration|eligible to work)\b/i,
  ],
  ['disability', /\bdisab(led|ility|ilities)\b/i],
  ['veteran', /\b(veteran|military|armed forces|protected veteran)\b/i],
  [
    'eeo',
    /\b(gender|sex|race|racial|ethnic(ity)?|ethnic group|hispanic|latin[oax]|sexual orientation|lgbt\w*|pronouns?|transgender|equal (employment )?opportunity|eeo\w*|self-identif\w*|diversity|religio\w*|caste|marital)\b/i,
  ],
  ['criminal', /\b(criminal|convict(ed|ion)s?|felon(y|ies)|background check|offen[cs]es?|arrest(ed)?)\b/i],
  ['references', /\breferences?\b|\breferee\b/i],
  ['age', /\b(date of birth|birth ?date|dob|how old|your age)\b/i],
  [
    'legal',
    /\b(i (hereby )?(certify|agree|acknowledge|consent|confirm|attest|understand|declare)|consent|privacy (policy|notice)|terms (and|&) conditions|attest|declaration|signature|e-?sign)\b/i,
  ],
];

export function sensitiveCategory(field: Pick<Field, 'label' | 'section' | 'helpText'>): SensitiveCategory | undefined {
  // The label decides first; section text only counts for EEO-style sections ("Voluntary Self-Identification").
  for (const [category, re] of RULES) if (re.test(field.label)) return category;
  if (field.helpText) for (const [category, re] of RULES) if (category !== 'legal' && re.test(field.helpText)) return category;
  if (field.section && /\b(equal (employment )?opportunity|eeo|self-identification|diversity|equality)\b/i.test(field.section)) {
    return 'eeo';
  }
  return undefined;
}

export const DEMOGRAPHIC: ReadonlySet<SensitiveCategory> = new Set(['eeo', 'disability', 'veteran']);
