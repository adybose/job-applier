// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { shows } from './actions';

describe('shows', () => {
  it('accepts the full option or a whole-word part of it', () => {
    expect(shows('India +91', 'India +91')).toBe(true);
    expect(shows('+91', 'India +91')).toBe(true);
    expect(shows('India', 'India +91')).toBe(true);
  });

  it('rejects empty, partial-word or different values', () => {
    expect(shows('', 'India +91')).toBe(false);
    expect(shows('+9', 'India +91')).toBe(false);
    expect(shows('+1', 'India +91')).toBe(false);
    expect(shows('+44', 'India +91')).toBe(false);
  });
});
