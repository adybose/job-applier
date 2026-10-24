import { describe, expect, it } from 'vitest';
import { isNavLike, isSubmitLike } from './buttons';

describe('isSubmitLike', () => {
  it.each([
    { text: 'Submit application' },
    { text: 'Apply' },
    { text: 'Apply now' },
    { text: 'Send' },
    { text: 'Finish' },
    { text: 'Confirm' },
    { text: 'Complete application' },
    { text: 'Go', type: 'submit' },
    { text: '', value: 'Submit Application', type: 'button' },
    { text: '→', ariaLabel: 'Submit your application' },
    { text: 'Done', title: 'Send application' },
    { text: 'Review', type: 'submit' },
  ])('blocks %o', (b) => {
    expect(isSubmitLike(b)).toBe(true);
  });

  it.each([
    { text: 'Next' },
    { text: 'Continue', type: 'submit' },
    { text: 'Save and continue', type: 'submit' },
    { text: 'Save draft' },
    { text: 'Upload File' },
    { text: 'Add another' },
  ])('allows %o', (b) => {
    expect(isSubmitLike(b)).toBe(false);
  });

  it('never treats "Continue and submit" as navigation', () => {
    expect(isSubmitLike({ text: 'Continue and submit', type: 'submit' })).toBe(true);
    expect(isNavLike({ text: 'Continue and submit' })).toBe(false);
  });

  it('marks Next/Continue as navigation', () => {
    expect(isNavLike({ text: 'Next' })).toBe(true);
    expect(isNavLike({ text: 'Save & Continue', type: 'submit' })).toBe(true);
    expect(isNavLike({ text: 'Upload' })).toBe(false);
  });
});
