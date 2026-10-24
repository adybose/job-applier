import { FORM_CONTROL, textOf } from './dom';

const MAX_CHARS = 12_000;
const PREFERRED = [
  '[data-qa*="job-description" i]',
  '[class*="descriptionText"]',
  '.posting-page',
  '#content',
  '[class*="job-description" i]',
  '[id*="job-description" i]',
  'article',
  'main',
];

/** Spec 03 R-PP-11: the posting's text, never the form's labels. */
export function extractJobDescription(doc: Document): string | undefined {
  for (const selector of PREFERRED) {
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      if (el.querySelector(FORM_CONTROL)) continue;
      const text = textOf(el);
      if (text.length > 200) return text.slice(0, MAX_CHARS);
    }
  }
  // Fallback: the largest block with no form controls inside.
  let best = '';
  for (const el of Array.from(doc.querySelectorAll('div, section, article'))) {
    if (el.querySelector(FORM_CONTROL)) continue;
    const text = textOf(el);
    if (text.length > best.length) best = text;
  }
  return best.length > 200 ? best.slice(0, MAX_CHARS) : undefined;
}

/** Spec 03 R-PP-1: "2 of 4" style progress, if the page shows one. */
export function extractStepHint(doc: Document): string | undefined {
  const progress = doc.querySelector('[role=progressbar][aria-valuenow][aria-valuemax]');
  if (progress) return `${progress.getAttribute('aria-valuenow')} of ${progress.getAttribute('aria-valuemax')}`;
  const candidates = doc.querySelectorAll('[aria-current=step], [class*="step" i], [class*="progress" i], h1, h2, h3');
  for (const el of Array.from(candidates)) {
    const m = /\b(?:step\s*)?(\d+)\s*(?:of|\/)\s*(\d+)\b/i.exec(textOf(el));
    if (m && Number(m[2]) <= 20) return `${m[1]} of ${m[2]}`;
  }
  return undefined;
}
