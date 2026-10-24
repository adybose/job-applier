import { z } from 'zod';

// Spec 02 R-PI-9 / R-PI-10.
export const SourceSchema = z.enum(['cv', 'linkedin', 'user']);
export type Source = z.infer<typeof SourceSchema>;

export const sourced = <T extends z.ZodType>(value: T) => z.object({ value, source: SourceSchema });
export interface Sourced<T> {
  value: T;
  source: Source;
}

export const ExperienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  start: z.string().describe('YYYY-MM or YYYY'),
  end: z.string().describe('YYYY-MM, YYYY, or "present"'),
  location: z.string().nullable(),
  bullets: z.array(z.string()),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  grade: z.string().nullable(),
});
export type Education = z.infer<typeof EducationSchema>;

export const LinkSchema = z.object({ label: z.string(), url: z.string() });
export const LanguageSchema = z.object({ name: z.string(), level: z.string().nullable() });
export const CertificationSchema = z.object({
  name: z.string(),
  issuer: z.string().nullable(),
  year: z.string().nullable(),
});

/** What the model extracts from one document. Plain values; sources are added in code. */
export const ExtractedProfileSchema = z.object({
  fullName: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  pronouns: z.string().nullable(),
  email: z.string(),
  phone: z.string(),
  city: z.string(),
  region: z.string().nullable(),
  country: z.string(),
  postalCode: z.string().nullable(),
  linkedin: z.string().nullable(),
  github: z.string().nullable(),
  portfolio: z.string().nullable(),
  website: z.string().nullable(),
  otherLinks: z.array(LinkSchema),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  skills: z.array(z.string()),
  languages: z.array(LanguageSchema),
  certifications: z.array(CertificationSchema),
});
export type ExtractedProfile = z.infer<typeof ExtractedProfileSchema>;

export const EMPTY_EXTRACTED: ExtractedProfile = {
  fullName: '',
  firstName: '',
  lastName: '',
  pronouns: null,
  email: '',
  phone: '',
  city: '',
  region: null,
  country: '',
  postalCode: null,
  linkedin: null,
  github: null,
  portfolio: null,
  website: null,
  otherLinks: [],
  experience: [],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
};

const str = sourced(z.string());
const optStr = str.optional();

export const ProfileSchema = z.object({
  schemaVersion: z.literal(1),
  identity: z.object({
    fullName: str,
    firstName: str,
    lastName: str,
    preferredName: optStr,
    pronouns: optStr,
  }),
  contact: z.object({
    email: str,
    phone: str,
    city: str,
    region: optStr,
    country: str,
    postalCode: optStr,
  }),
  links: z.object({
    linkedin: optStr,
    github: optStr,
    portfolio: optStr,
    website: optStr,
    other: z.array(sourced(LinkSchema)),
  }),
  workAuthorization: z.array(
    sourced(z.object({ country: z.string(), authorized: z.boolean(), status: z.string().optional() })),
  ),
  sponsorshipNeeded: sourced(z.boolean().nullable()),
  noticePeriod: optStr,
  earliestStartDate: optStr,
  salaryExpectation: sourced(
    z.object({
      amount: z.number().optional(),
      currency: z.string().optional(),
      period: z.enum(['year', 'month', 'hour']).optional(),
      askEachTime: z.boolean(),
    }),
  ),
  relocation: sourced(z.object({ willing: z.boolean().nullable(), locations: z.array(z.string()) })),
  remotePreference: sourced(z.enum(['remote', 'hybrid', 'onsite', 'any']).nullable()),
  experience: z.array(sourced(ExperienceSchema)),
  education: z.array(sourced(EducationSchema)),
  skills: z.array(sourced(z.string())),
  languages: z.array(sourced(LanguageSchema)),
  certifications: z.array(sourced(CertificationSchema)),
  custom: z.record(z.string(), str),
});
export type Profile = z.infer<typeof ProfileSchema>;

export interface Conflict {
  path: string;
  cvValue: string;
  linkedinValue: string;
}

export function emptyProfile(): Profile {
  const u = <T>(value: T): Sourced<T> => ({ value, source: 'user' });
  return {
    schemaVersion: 1,
    identity: { fullName: u(''), firstName: u(''), lastName: u('') },
    contact: { email: u(''), phone: u(''), city: u(''), country: u('') },
    links: { other: [] },
    workAuthorization: [],
    sponsorshipNeeded: u(null),
    salaryExpectation: u({ askEachTime: true }),
    relocation: u({ willing: null, locations: [] }),
    remotePreference: u(null),
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    custom: {},
  };
}

/** Wraps one document's extraction in a Profile, tagging every value with its source (R-PI-10). */
export function profileFromExtracted(e: ExtractedProfile, source: Exclude<Source, 'user'>): Profile {
  const s = <T>(value: T): Sourced<T> => ({ value, source });
  const opt = (value: string | null) => (value && value.trim() ? s(value.trim()) : undefined);
  const base = emptyProfile();
  return {
    ...base,
    identity: {
      fullName: s(e.fullName.trim()),
      firstName: s(e.firstName.trim()),
      lastName: s(e.lastName.trim()),
      pronouns: opt(e.pronouns),
    },
    contact: {
      email: s(e.email.trim()),
      phone: s(e.phone.trim()),
      city: s(e.city.trim()),
      region: opt(e.region),
      country: s(e.country.trim()),
      postalCode: opt(e.postalCode),
    },
    links: {
      linkedin: opt(e.linkedin),
      github: opt(e.github),
      portfolio: opt(e.portfolio),
      website: opt(e.website),
      other: e.otherLinks.map(s),
    },
    experience: e.experience.map(s),
    education: e.education.map(s),
    skills: e.skills.filter((x) => x.trim()).map(s),
    languages: e.languages.map(s),
    certifications: e.certifications.map(s),
  };
}
