// Spec 01 R-PS-7 and spec 03 R-PP-3. Pure functions so the side panel and the content script
// make the same decision about the same control.
export interface ButtonDescriptor {
  text: string;
  value?: string;
  ariaLabel?: string;
  title?: string;
  name?: string;
  type?: string;
}

const SUBMIT_WORDS = /\b(submit|apply|send|finish|confirm|complete application)\b/i;
const NAV_WORDS = /\b(next|continue|save and continue|save & continue)\b/i;

function texts(b: ButtonDescriptor): string[] {
  return [b.text, b.value, b.ariaLabel, b.title, b.name].filter((t): t is string => !!t && t.trim() !== '');
}

/**
 * True for anything that could send the application. `type=submit` counts too, unless the control
 * is clearly step navigation ("Next"/"Continue") and says nothing about submitting.
 */
export function isSubmitLike(b: ButtonDescriptor): boolean {
  const all = texts(b);
  if (all.some((t) => SUBMIT_WORDS.test(t))) return true;
  if ((b.type ?? '').toLowerCase() === 'submit') return !all.some((t) => NAV_WORDS.test(t));
  return false;
}

export function isNavLike(b: ButtonDescriptor): boolean {
  return texts(b).some((t) => NAV_WORDS.test(t)) && !isSubmitLike(b);
}
