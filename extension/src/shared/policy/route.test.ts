import { describe, expect, it } from 'vitest';
import type { Proposal } from '../agent/types';
import { field, yesNo } from '../agent/test-fixtures';
import { route, type RouteContext } from './route';
import { sensitiveCategory } from './sensitive';

const ctx: RouteContext = { failed: new Set(), written: new Map() };
const p = (fieldId: string, extra: Partial<Proposal> = {}): Proposal => ({
  fieldId,
  action: 'fill',
  value: 'x',
  confidence: 0.9,
  rationale: '',
  sensitive: false,
  origin: 'model',
  ...extra,
});

describe('route', () => {
  // AC-AL-2
  it('auto-fills mapper values', () => {
    const f = field('Email');
    expect(route(f, p(f.id, { origin: 'mapper', confidence: 1 }), ctx).route).toBe('auto');
  });

  // AC-AL-3
  it('auto-fills confident model answers and asks about unsure ones', () => {
    const f = field('Years of experience with Python', { kind: 'number' });
    expect(route(f, p(f.id, { confidence: 0.9, value: '6' }), ctx).route).toBe('auto');
    expect(route(f, p(f.id, { confidence: 0.85, value: '6' }), ctx).route).toBe('auto');
    expect(route(f, p(f.id, { confidence: 0.7, value: '6' }), ctx).route).toBe('approval');
  });

  // AC-AL-4
  it('sends sensitive questions for approval even when the model says otherwise', () => {
    const f = field('Expected salary');
    expect(route(f, p(f.id, { confidence: 0.99, sensitive: false, value: '150000' }), ctx)).toMatchObject({
      route: 'approval',
      category: 'salary',
    });
    const mapped = field('Will you require visa sponsorship?', { kind: 'select', options: yesNo });
    expect(route(mapped, p(mapped.id, { origin: 'mapper', confidence: 1, value: 'No' }), ctx).route).toBe('approval');
  });

  // AC-AL-5
  it('always asks about demographic questions', () => {
    const f = field('Gender', { kind: 'select', section: 'Voluntary Self-Identification' });
    expect(route(f, p(f.id, { origin: 'mapper', confidence: 1, value: 'Decline To Self Identify' }), ctx)).toMatchObject({
      route: 'approval',
      category: 'eeo',
    });
  });

  it('lets the model flag extra sensitivity, never remove it', () => {
    const f = field('Favorite color');
    expect(route(f, p(f.id, { confidence: 0.99, sensitive: true }), ctx).route).toBe('approval');
  });

  // AC-AL-6
  it('asks a question for required fields without an answer, and skips optional ones', () => {
    const req = field('Notice period', { required: true });
    expect(route(req, undefined, ctx).route).toBe('question');
    expect(route(req, p(req.id, { action: 'skip', value: '' }), ctx).route).toBe('question');
    const opt = field('Twitter handle');
    expect(route(opt, undefined, ctx).route).toBe('skip');
  });

  // AC-AL-7 and AC-PI-9
  it('routes uploads: CV auto, LinkedIn PDF approval, anything else handoff', () => {
    const resume = field('Resume/CV', { kind: 'file' });
    expect(route(resume, p(resume.id, { action: 'upload_file', origin: 'mapper', value: 'resume' }), ctx).route).toBe('auto');
    expect(
      route(resume, p(resume.id, { action: 'upload_file', origin: 'mapper', value: 'linkedin', usesLinkedinPdf: true }), ctx),
    ).toMatchObject({ route: 'approval', reason: 'Use your LinkedIn PDF as your resume?' });
    expect(route(resume, undefined, ctx).route).toBe('handoff');
    const portfolio = field('Portfolio (PDF)', { kind: 'file' });
    expect(route(portfolio, p(portfolio.id, { action: 'upload_file', value: 'resume' }), ctx).route).toBe('handoff');
  });

  // AC-PS-7
  it('hands off passwords, failed fields and human-only steps', () => {
    const pw = field('Create a password', { kind: 'password' });
    expect(route(pw, p(pw.id, { origin: 'mapper', confidence: 1 }), ctx).route).toBe('handoff');
    const failed = field('City');
    expect(route(failed, p(failed.id, { origin: 'mapper' }), { ...ctx, failed: new Set([failed.id]) }).route).toBe('handoff');
    expect(route(field('Record a video answer'), undefined, ctx).route).toBe('handoff');
    expect(route(field('Type your full name as your e-signature'), undefined, ctx).route).toBe('handoff');
  });

  it('asks before replacing an existing value, but not our own', () => {
    const f = field('City', { value: 'Seattle' });
    expect(route(f, p(f.id, { origin: 'mapper', value: 'Portland' }), ctx).route).toBe('approval');
    expect(route(f, p(f.id, { origin: 'mapper', value: 'Portland' }), { ...ctx, written: new Map([[f.id, 'Seattle']]) }).route).toBe(
      'auto',
    );
    expect(route(f, p(f.id, { origin: 'mapper', value: 'seattle' }), ctx).route).toBe('auto');
  });

  it('always reviews drafted text', () => {
    const f = field('Why do you want to work here?', { kind: 'textarea' });
    expect(route(f, p(f.id, { origin: 'draft', confidence: 1 }), ctx).route).toBe('approval');
  });

  it('treats consent checkboxes as legal attestations', () => {
    const f = field('I agree to Acme Robotics storing and processing my data', { kind: 'checkbox', value: 'false' });
    expect(route(f, p(f.id, { action: 'set_checked', value: 'true', confidence: 0.99 }), ctx)).toMatchObject({
      route: 'approval',
      category: 'legal',
    });
  });
});

describe('sensitiveCategory', () => {
  it.each([
    ['Desired salary (USD)', 'salary'],
    ['Expected compensation', 'salary'],
    ['Will you now or in the future require sponsorship for employment visa status?', 'work-authorization'],
    ['Are you legally authorized to work in the United States?', 'work-authorization'],
    ['Are you Hispanic/Latino?', 'eeo'],
    ['Race', 'eeo'],
    ['Gender identity', 'eeo'],
    ['Pronouns', 'eeo'],
    ['Disability Status', 'disability'],
    ['Do you consider yourself to have a disability?', 'disability'],
    ['Veteran Status', 'veteran'],
    ['Have you ever been convicted of a crime?', 'criminal'],
    ['Please list two references', 'references'],
    ['I confirm the information I have given is accurate.', 'legal'],
    ['Date of birth', 'age'],
  ])('%s → %s', (label, category) => {
    expect(sensitiveCategory({ label })).toBe(category);
  });

  it.each(['First name', 'Email', 'Why do you want to work at Acme?', 'How did you hear about this job?', 'GitHub URL'])(
    '%s is not sensitive',
    (label) => {
      expect(sensitiveCategory({ label })).toBeUndefined();
    },
  );

  it('treats any question in an EEO section as demographic', () => {
    expect(sensitiveCategory({ label: 'Ethnic group', section: 'Equality and diversity monitoring (optional)' })).toBe('eeo');
    expect(sensitiveCategory({ label: 'Do you have a car?', section: 'Voluntary Self-Identification' })).toBe('eeo');
  });
});
