import { describe, expect, it } from 'vitest';
import { mapField } from './mapper';
import { alex, field, yesNo } from './test-fixtures';

const ctx = { hasResume: true, hasLinkedinPdf: true };

describe('mapField (stage 1)', () => {
  // AC-AL-2
  it('maps by autocomplete and by label dictionary with origin "mapper"', () => {
    const p = alex();
    expect(mapField(field('Contact', { kind: 'email', autocomplete: 'email' }), p, ctx)).toMatchObject({
      action: 'fill',
      value: 'alex.rivera@example.com',
      origin: 'mapper',
      confidence: 1,
    });
    expect(mapField(field('LinkedIn profile URL'), p, ctx)).toMatchObject({
      value: 'https://www.linkedin.com/in/alex-rivera-example',
      origin: 'mapper',
    });
  });

  it.each([
    ['First Name', 'Alex'],
    ['Last Name', 'Rivera'],
    ['Full name', 'Alex Rivera'],
    ['Name', 'Alex Rivera'],
    ['Preferred name', 'Alex'],
    ['Email address', 'alex.rivera@example.com'],
    ['Phone', '+1 503 555 0142'],
    ['Phone number', '+1 503 555 0142'],
    ['GitHub URL', 'https://github.com/alexrivera-dev'],
    ['Website', 'https://alexrivera.example.dev'],
    ['Portfolio URL', 'https://alexrivera.example.dev'],
    ['City', 'Portland'],
    ['Location (City)', 'Portland, Oregon, USA'],
    ['Current location', 'Portland, Oregon, USA'],
    ['Current company', 'Globex Robotics'],
    ['What is your notice period?', '4 weeks'],
  ])('maps "%s" to %s', (label, value) => {
    expect(mapField(field(label), alex(), ctx)?.value).toBe(value);
  });

  it('maps the given-name autocomplete even with an odd label', () => {
    expect(mapField(field('Field 1', { autocomplete: 'section-a given-name' }), alex(), ctx)?.value).toBe('Alex');
  });

  it('never maps questions about other people', () => {
    expect(mapField(field("Reference's email"), alex(), ctx)).toBeUndefined();
    expect(mapField(field('Hiring manager name'), alex(), ctx)).toBeUndefined();
  });

  it('maps a country select only to a matching option', () => {
    const country = field('Country', {
      kind: 'select',
      options: [
        { value: 'uk', label: 'United Kingdom' },
        { value: 'us', label: 'United States' },
      ],
    });
    expect(mapField(country, alex(), ctx)).toMatchObject({ action: 'select_option', value: 'United States' });
    expect(mapField({ ...country, options: [{ value: 'ie', label: 'Ireland' }] }, alex(), ctx)).toBeUndefined();
  });

  it('attaches the CV to resume fields and nothing else', () => {
    expect(mapField(field('Resume/CV', { kind: 'file' }), alex(), ctx)).toMatchObject({ action: 'upload_file', value: 'resume' });
    expect(mapField(field('Cover Letter', { kind: 'file' }), alex(), ctx)).toBeUndefined();
    expect(mapField(field('Resume', { kind: 'file' }), alex(), { hasResume: false, hasLinkedinPdf: true })).toMatchObject({
      usesLinkedinPdf: true,
    });
  });

  // R-AL-13
  it('proposes "decline" for demographic questions', () => {
    const gender = field('Gender', {
      kind: 'select',
      options: [
        { value: '1', label: 'Male' },
        { value: '2', label: 'Female' },
        { value: '3', label: 'Decline To Self Identify' },
      ],
    });
    expect(mapField(gender, alex(), ctx)).toMatchObject({ value: 'Decline To Self Identify' });
    const veteran = field('Veteran Status', {
      kind: 'select',
      options: [
        { value: '1', label: 'I am not a protected veteran' },
        { value: '3', label: "I don't wish to answer" },
      ],
    });
    expect(mapField(veteran, alex(), ctx)?.value).toBe("I don't wish to answer");
  });

  it('answers sponsorship, work authorization and relocation from preferences', () => {
    const p = alex();
    expect(mapField(field('Will you now or in the future require sponsorship?', { kind: 'select', options: yesNo }), p, ctx)?.value).toBe('No');
    expect(
      mapField(field('Are you legally authorized to work in the United States?', { kind: 'select', options: yesNo }), p, ctx)?.value,
    ).toBe('Yes');
    expect(mapField(field('Are you authorized to work in the UK?', { kind: 'radio-group', options: yesNo }), p, ctx)).toBeUndefined();
    expect(mapField(field('Are you willing to relocate?', { kind: 'radio-group', options: yesNo }), p, ctx)?.value).toBe('Yes');
  });

  // R-AL-14
  it('asks about salary when the profile says "ask me each time"', () => {
    const p = alex();
    expect(mapField(field('Desired salary (USD)'), p, ctx)).toMatchObject({ action: 'fill', value: '165,000 USD per year' });
    expect(mapField(field('Expected compensation (USD)', { kind: 'number' }), p, ctx)?.value).toBe('165000');
    p.salaryExpectation = { value: { askEachTime: true }, source: 'user' };
    expect(mapField(field('Desired salary (USD)'), p, ctx)).toMatchObject({ action: 'ask' });
  });

  it('leaves open questions to the model', () => {
    expect(mapField(field('Why do you want to work at Acme Robotics?', { kind: 'textarea' }), alex(), ctx)).toBeUndefined();
    expect(mapField(field('How did you hear about this job?', { kind: 'select', options: yesNo }), alex(), ctx)).toBeUndefined();
  });
});
