import { describe, expect, it } from 'vitest';
import { bestOption, declineOption } from './options';

const o = (...labels: string[]) => labels.map((label, i) => ({ value: String(i), label }));

describe('bestOption', () => {
  it('prefers exact label or value matches, ignoring case and punctuation', () => {
    expect(bestOption(o('United States', 'United Kingdom'), 'united kingdom')?.label).toBe('United Kingdom');
    expect(bestOption([{ value: 'UK', label: 'Britain' }], 'uk')?.label).toBe('Britain');
  });

  it('matches phone-country options that carry a dial code, including short country names', () => {
    const countries = o('United States +1', 'United Kingdom +44', 'India +91', 'British Indian Ocean Territory +246');
    expect(bestOption(countries, 'India')?.label).toBe('India +91');
    expect(bestOption(countries, 'USA')?.label).toBe('United States +1');
    expect(bestOption(countries, 'UK')?.label).toBe('United Kingdom +44');
  });

  it('matches a unique prefix or substring', () => {
    expect(bestOption(o('Yes, I am authorized', 'No'), 'Yes')?.label).toBe('Yes, I am authorized');
    expect(bestOption(o('I am not a protected veteran', 'I identify as a protected veteran'), 'not a protected')?.label).toBe(
      'I am not a protected veteran',
    );
  });

  it('falls back to word overlap and refuses weak matches', () => {
    expect(bestOption(o('Decline To Self Identify', 'Male'), 'decline to self-identify')?.label).toBe(
      'Decline To Self Identify',
    );
    expect(bestOption(o('Male', 'Female'), 'Purple')).toBeUndefined();
    expect(bestOption(o('Male', 'Female'), '')).toBeUndefined();
  });
});

describe('declineOption', () => {
  it.each([
    'Decline To Self Identify',
    'Decline to self-identify',
    'Prefer not to say',
    "I don't wish to answer",
    'I do not want to answer',
  ])('finds %s', (label) => {
    expect(declineOption(o('Yes', 'No', label))?.label).toBe(label);
  });

  it('returns undefined when there is no decline option', () => {
    expect(declineOption(o('Yes', 'No'))).toBeUndefined();
  });
});
