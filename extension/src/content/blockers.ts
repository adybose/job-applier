import type { Blocker } from '../shared/snapshot';
import { deepElements, textOf } from './dom';
import { hiddenByStyle, isActionable } from './fields';
import { idFor } from './registry';

const CAPTCHA_SELECTOR = '.g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey]';
const CAPTCHA_TOKEN = '[name="g-recaptcha-response"], [name="h-captcha-response"], [name="cf-turnstile-response"]';
const CAPTCHA_FRAME = /google\.com\/recaptcha|recaptcha\.net|hcaptcha\.com|challenges\.cloudflare\.com/;
const OAUTH = /apply (with|using|via) (linkedin|indeed|google|seek|xing)/i;
const RECORDER = /\b(start recording|record (a |your )?(video|answer|response)|record now)\b/i;
const LOGIN_HEADING = /\b(sign in|log in|login|create (an )?account)\b/i;

/** Spec 03 R-PP-13. */
export function findBlockers(doc: Document): Blocker[] {
  const out: Blocker[] = [];
  const seen = new Set<Element>();
  const add = (el: Element, type: Blocker['type'], description: string) => {
    const host = type === 'captcha' ? (el.closest(CAPTCHA_SELECTOR) ?? el) : el;
    if (seen.has(host)) return;
    seen.add(host);
    const token = type === 'captcha' ? host.querySelector<HTMLTextAreaElement | HTMLInputElement>(CAPTCHA_TOKEN) : null;
    out.push({
      id: idFor(host, 'k', `${type}|${description}`),
      frameId: 0,
      type,
      description,
      resolved: !!token?.value,
    });
  };

  for (const el of deepElements(doc)) {
    // A blocker on a step that isn't shown yet is not a blocker yet.
    if (!(el instanceof HTMLInputElement) && el.matches(`${CAPTCHA_SELECTOR}, iframe, button, a, [role=button], h1, h2, h3`) && hiddenByStyle(el)) continue;
    if (el.matches(CAPTCHA_SELECTOR) && !el.parentElement?.closest(CAPTCHA_SELECTOR)) {
      add(el, 'captcha', 'A CAPTCHA check');
    } else if (el instanceof HTMLIFrameElement && CAPTCHA_FRAME.test(el.src)) {
      add(el, 'captcha', 'A CAPTCHA check');
    } else if (el instanceof HTMLInputElement && el.type === 'password' && isActionable(el)) {
      add(el, 'login', 'A password field (sign-in or account creation)');
    } else if (el.matches('button, a, [role=button], input[type=button]')) {
      const label = textOf(el) || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '';
      if (OAUTH.test(label)) add(el, 'oauth', `"${label}" button`);
      else if (RECORDER.test(label)) add(el, 'recorder', 'A video or audio recorder');
    } else if (/^H[1-3]$/.test(el.tagName) && LOGIN_HEADING.test(textOf(el)) && doc.querySelector('input[type=password]')) {
      add(el, 'login', 'A sign-in or account page');
    }
  }
  return out;
}
