import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { field } from '../agent/test-fixtures';
import { route } from '../policy/route';
import { findMatch, listAnswers, markUsed, normalizeQuestion, saveAnswer, similarity, type SavedAnswer } from './answers';

const entry = (questionText: string, answer: string, extra: Partial<SavedAnswer> = {}): SavedAnswer => ({
  normalizedKey: normalizeQuestion(questionText),
  questionText,
  answer,
  fieldKind: 'radio-group',
  usedCount: 0,
  lastUsed: 0,
  sensitive: false,
  ...extra,
});

const yesNo = [
  { value: 'y', label: 'Yes' },
  { value: 'n', label: 'No' },
];

describe('normalizeQuestion', () => {
  it('drops boilerplate, digits and punctuation, applies synonyms, sorts', () => {
    expect(normalizeQuestion('What is your expected compensation (USD)? *')).toBe('salary');
    expect(normalizeQuestion('Are you willing to relocate?')).toBe('relocate');
    expect(normalizeQuestion('Would you consider relocating?')).toBe('relocate');
    expect(normalizeQuestion('How did you hear about us? (optional)')).toBe('hear');
  });
});

describe('findMatch', () => {
  // AC-AM-1
  it('matches relocation questions worded differently', () => {
    const f = field('Would you consider relocating?', { kind: 'radio-group', options: yesNo });
    expect(findMatch(f, [entry('Are you willing to relocate?', 'Yes')])).toMatchObject({ value: 'Yes', score: 1 });
  });

  // AC-AM-2
  it('matches salary and compensation, and still routes to approval with the value pre-filled', () => {
    const f = field('Expected compensation (USD)');
    const m = findMatch(f, [entry('Desired salary', '165,000 USD', { fieldKind: 'text', sensitive: true })]);
    expect(m?.value).toBe('165,000 USD');
    const proposal = { fieldId: f.id, action: 'fill' as const, value: m?.value ?? '', confidence: m?.score ?? 0, rationale: '', sensitive: true, origin: 'memory' as const };
    expect(route(f, proposal, { failed: new Set(), written: new Map() })).toMatchObject({ route: 'approval', category: 'salary' });
  });

  // AC-AM-3
  it('lets the overlap rule decide for company-specific essays, always via approval', () => {
    const f = field('Why do you want to work at Globex?', { kind: 'textarea' });
    const m = findMatch(f, [entry('Why do you want to work at Acme?', 'Because robots.', { fieldKind: 'textarea' })]);
    expect(similarity(normalizeQuestion(f.label), normalizeQuestion('Why do you want to work at Acme?'))).toBeCloseTo(0.6, 1);
    expect(m).toBeDefined();
    const proposal = { fieldId: f.id, action: 'fill' as const, value: m?.value ?? '', confidence: 1, rationale: '', sensitive: false, origin: 'memory' as const };
    expect(route(f, proposal, { failed: new Set(), written: new Map() }).route).toBe('approval');
  });

  // AC-AM-4
  it('snaps a remembered "Yes" to the closest current option', () => {
    const f = field('Are you willing to relocate?', {
      kind: 'select',
      options: [
        { value: '1', label: 'Yes, I am' },
        { value: '0', label: 'No' },
      ],
    });
    expect(findMatch(f, [entry('Willing to relocate?', 'Yes')])?.value).toBe('Yes, I am');
  });

  it('needs a compatible kind and a real option', () => {
    const select = field('Are you willing to relocate?', { kind: 'select', options: [{ value: 'x', label: 'Maybe later' }] });
    expect(findMatch(select, [entry('Willing to relocate?', 'Yes')])).toBeUndefined();
    const upload = field('Relocation documents', { kind: 'file' });
    expect(findMatch(upload, [entry('Relocation', 'Yes')])).toBeUndefined();
  });

  it('does not match unrelated questions', () => {
    const f = field('Do you have a driving licence?', { kind: 'radio-group', options: yesNo });
    expect(findMatch(f, [entry('Are you willing to relocate?', 'Yes')])).toBeUndefined();
  });
});

describe('storage', () => {
  // AC-AM-5 is enforced by callers: saveAnswer is only called when "Remember" is checked.
  it('saves, replaces by question, and counts uses', async () => {
    const db = 'answers-test';
    await saveAnswer({ questionText: 'Are you willing to relocate?', answer: 'Yes', fieldKind: 'radio-group', sensitive: false }, db);
    await saveAnswer({ questionText: 'Would you consider relocating?', answer: 'No', fieldKind: 'radio-group', sensitive: false }, db);
    let all = await listAnswers(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ answer: 'No', usedCount: 0 });
    await markUsed('relocate', db);
    all = await listAnswers(db);
    expect(all[0]?.usedCount).toBe(1);
  });
});
