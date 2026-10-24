import { ActionSchema, type ActionResult, type ParsedAction } from '../shared/actions';
import { isSubmitLike } from '../shared/policy/buttons';
import { bestOption } from '../shared/policy/options';
import { closeCombobox, comboboxContainer, listboxFor, openCombobox } from './combobox';
import { textOf } from './dom';
import { currentValue, fieldKind, radioLabel } from './fields';
import { clearHighlight, highlight } from './overlay';
import { elementFor } from './registry';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SETTLE_MS = 300;

/** Values this agent wrote, so re-filling our own value is not an "overwrite" (R-AC-11/R-AC-12). */
const agentValues = new Map<string, string>();

const fail = (reason: Extract<ActionResult, { ok: false }>['reason'], detail?: string): ActionResult => ({
  ok: false,
  reason,
  detail,
});

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function nativeSetValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
}

function fireInputEvents(el: Element, data?: string): void {
  el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: data ?? null }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Strategy 1 (R-AC-3): native setter + input/change/blur, which React and Vue both observe. */
function setterFill(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.focus();
  nativeSetValue(el, value);
  fireInputEvents(el, value);
  el.blur();
}

/** Strategy 2: behave like typing (select all, insertText). */
function typingFill(el: HTMLInputElement | HTMLTextAreaElement | HTMLElement, value: string): void {
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select();
  } else {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
  // execCommand is deprecated but is still the only way to produce a trusted-looking edit.
  const ok = document.execCommand('insertText', false, value);
  if (!ok) {
    el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) nativeSetValue(el, value);
    else el.textContent = value;
    fireInputEvents(el, value);
  }
  el.blur();
}

function normalizeForInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): string {
  let v = value;
  if (el instanceof HTMLInputElement && el.type === 'date') {
    const m = /(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(v);
    if (m) v = `${m[1]}-${(m[2] ?? '1').padStart(2, '0')}-${(m[3] ?? '1').padStart(2, '0')}`;
  }
  if (el instanceof HTMLInputElement && el.type === 'number') v = v.replace(/[^\d.-]/g, '');
  if (el.maxLength > 0 && v.length > el.maxLength) v = v.slice(0, el.maxLength);
  return v;
}

/** Reads the value back, then again after the page had a chance to reset it (R-AC-9/R-AC-10). */
async function sticks(read: () => string, expected: string): Promise<boolean> {
  if (!same(read(), expected)) return false;
  await wait(SETTLE_MS);
  return same(read(), expected);
}

function mayOverwrite(fieldId: string, current: string, target: string, overwrite: boolean): boolean {
  if (overwrite || !current.trim() || same(current, target)) return true;
  return agentValues.get(fieldId) !== undefined && same(agentValues.get(fieldId) ?? '', current);
}

async function fill(fieldId: string, el: Element, value: string, overwrite: boolean): Promise<ActionResult> {
  const kind = fieldKind(el);
  if (kind === 'password') return fail('not-allowed', 'Lazy Apply never types passwords.');
  if (kind === 'contenteditable') {
    const html = el as HTMLElement;
    const current = textOf(html);
    if (same(current, value)) return { ok: true, value: current };
    if (!mayOverwrite(fieldId, current, value, overwrite)) return fail('needs-approval', 'The field already has text.');
    typingFill(html, value);
    if (await sticks(() => textOf(html), value)) return done(fieldId, value);
    html.textContent = value;
    fireInputEvents(html, value);
    return (await sticks(() => textOf(html), value)) ? done(fieldId, value) : fail('did-not-stick');
  }
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return fail('invalid', `Can't type into a ${kind}.`);
  if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'file', 'submit', 'button'].includes(el.type)) {
    return fail('invalid', `Can't type into a ${el.type}.`);
  }

  const target = normalizeForInput(el, value);
  if (same(el.value, target)) return { ok: true, value: el.value };
  if (!mayOverwrite(fieldId, el.value, target, overwrite)) return fail('needs-approval', 'The field already has a value.');

  setterFill(el, target);
  if (await sticks(() => el.value, target)) return done(fieldId, target);
  typingFill(el, target);
  if (await sticks(() => el.value, target)) return done(fieldId, target);
  return fail('did-not-stick', 'The page did not keep the value.');
}

function done(fieldId: string, value: string): ActionResult {
  agentValues.set(fieldId, value);
  return { ok: true, value };
}

async function selectOption(fieldId: string, el: Element, value: string, overwrite: boolean): Promise<ActionResult> {
  // Toggle-button groups (Ashby Yes/No) are registered on their container.
  const buttons = Array.from(el.querySelectorAll<HTMLElement>(':scope > button, :scope > [role=button]'));
  if (buttons.length >= 2 && !(el instanceof HTMLSelectElement)) {
    const options = buttons.map((b) => ({ value: textOf(b), label: textOf(b) }));
    const match = bestOption(options, value);
    const button = buttons.find((b) => textOf(b) === match?.label);
    if (!button || !match) return fail('no-matching-option', value);
    button.click();
    const read = () => textOf(buttons.find((b) => b.getAttribute('aria-pressed') === 'true')) || (el as HTMLElement).dataset.value || '';
    return (await sticks(read, match.label)) ? done(fieldId, match.label) : fail('did-not-stick');
  }

  if (el instanceof HTMLSelectElement) {
    const options = Array.from(el.options).map((o) => ({ value: o.value, label: o.text.trim() }));
    const match = bestOption(options.filter((o) => o.value !== ''), value);
    if (!match) return fail('no-matching-option', value);
    const current = currentValue(el, 'select');
    if (same(current, match.label)) return { ok: true, value: current };
    if (!mayOverwrite(fieldId, current, match.label, overwrite)) return fail('needs-approval', 'Something is already selected.');
    el.focus();
    nativeSetValue(el, match.value);
    fireInputEvents(el);
    el.blur();
    if (await sticks(() => currentValue(el, 'select'), match.label)) return done(fieldId, match.label);
    return fail('did-not-stick');
  }

  if (el instanceof HTMLInputElement && el.type === 'radio') {
    const root = el.getRootNode() as Document | ShadowRoot;
    const group = Array.from(root.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(el.name)}"]`));
    const options = group.map((r) => ({ value: r.value, label: radioLabel(r) }));
    const match = bestOption(options, value);
    const radio = group.find((r) => r.value === match?.value && radioLabel(r) === match?.label);
    if (!radio || !match) return fail('no-matching-option', value);
    const current = currentValue(el, 'radio-group', group);
    if (!mayOverwrite(fieldId, current, match.label, overwrite)) return fail('needs-approval', 'Another option is already chosen.');
    if (!radio.checked) radio.click();
    if (await sticks(() => currentValue(el, 'radio-group', group), match.label)) return done(fieldId, match.label);
    return fail('did-not-stick');
  }

  if (el instanceof HTMLElement && fieldKind(el) === 'combobox') return selectCombobox(fieldId, el, value, overwrite);
  return fail('invalid', 'This field has no options.');
}

/** React-Select and ARIA comboboxes: open, filter by typing, click the best option. Never presses Enter. */
async function selectCombobox(fieldId: string, input: HTMLElement, value: string, overwrite: boolean): Promise<ActionResult> {
  const read = () => currentValue(input, 'combobox');
  const current = read();
  if (same(current, value)) return { ok: true, value: current };
  if (!mayOverwrite(fieldId, current, value, overwrite)) return fail('needs-approval', 'Something is already selected.');

  const attempt = async (filter: boolean): Promise<string | undefined> => {
    openCombobox(input);
    if (input instanceof HTMLInputElement) {
      // Unfiltered first (fuzzy match over every option); typing a filter is the fallback for long or async lists.
      const text = filter ? value : '';
      if (input.value !== text) {
        nativeSetValue(input, text);
        fireInputEvents(input, text);
      }
    }
    let listbox: Element | null = null;
    for (let i = 0; i < 20 && !listbox?.querySelector('[role=option]'); i++) {
      await wait(25);
      listbox = listboxFor(input);
    }
    const optionEls = listbox ? Array.from(listbox.querySelectorAll<HTMLElement>('[role=option]')) : [];
    const match = bestOption(
      optionEls.map((o) => ({ value: textOf(o), label: textOf(o) })),
      value,
    );
    const optionEl = optionEls.find((o) => textOf(o) === match?.label);
    if (!optionEl || !match) {
      closeCombobox(input);
      return undefined;
    }
    optionEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    optionEl.click();
    return match.label;
  };

  for (const filter of [false, true]) {
    const chosen = await attempt(filter);
    if (chosen && (await sticks(read, chosen))) {
      comboboxContainer(input).setAttribute('data-lazyapply-value', chosen);
      return done(fieldId, chosen);
    }
  }
  return fail('did-not-stick', 'Could not pick an option in this dropdown.');
}

function acceptsPdf(accept: string | null): boolean {
  if (!accept) return true;
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .some((a) => a === '.pdf' || a === 'application/pdf' || a === 'application/*' || a === '*/*' || a === '*');
}

async function uploadResume(fieldId: string, el: Element, file: { name: string; type: string; base64: string }): Promise<ActionResult> {
  if (!(el instanceof HTMLInputElement) || el.type !== 'file') return fail('invalid', 'Not a file field.');
  if (!acceptsPdf(el.getAttribute('accept'))) return fail('not-allowed', 'This upload does not accept PDFs.');
  if (el.files?.length === 1 && el.files[0]?.name === file.name) return { ok: true, value: file.name };

  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const transfer = new DataTransfer();
  transfer.items.add(new File([bytes], file.name, { type: file.type }));
  el.files = transfer.files;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  const read = () => (el.files?.length === 1 ? (el.files[0]?.name ?? '') : '');
  return (await sticks(read, file.name)) ? done(fieldId, file.name) : fail('did-not-stick');
}

async function setChecked(fieldId: string, el: Element, checked: boolean): Promise<ActionResult> {
  if (!(el instanceof HTMLInputElement) || el.type !== 'checkbox') return fail('invalid', 'Not a checkbox.');
  if (el.checked !== checked) el.click();
  const read = () => String(el.checked);
  return (await sticks(read, String(checked))) ? done(fieldId, String(checked)) : fail('did-not-stick');
}

/** Spec 01 R-PS-8 / spec 04 R-AC-7: the second, in-page check. Submit-like controls are never clicked. */
function click(el: Element): ActionResult {
  const html = el as HTMLElement;
  const descriptor = {
    text: textOf(html) || (html as HTMLInputElement).value || '',
    value: (html as HTMLInputElement).value || undefined,
    ariaLabel: html.getAttribute('aria-label') ?? undefined,
    title: html.getAttribute('title') ?? undefined,
    name: html.getAttribute('name') ?? undefined,
    type: (html.getAttribute('type') ?? (html.tagName === 'BUTTON' ? 'submit' : 'button')).toLowerCase(),
  };
  if (isSubmitLike(descriptor)) return fail('not-allowed', 'Lazy Apply never clicks submit buttons.');
  html.click();
  return { ok: true, value: descriptor.text };
}

/** Entry point for every action (spec 04). Validates the shape first: unknown actions are rejected. */
export async function perform(raw: unknown): Promise<ActionResult> {
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid', 'Unknown action.');
  const a: ParsedAction = parsed.data;

  if (a.action === 'clear_highlight') {
    clearHighlight(a.fieldId);
    return { ok: true, value: '' };
  }
  const id = a.action === 'click' ? a.buttonId : a.fieldId;
  const el = elementFor(id);
  if (!el) return fail('not-found', 'The field is no longer on the page.');

  switch (a.action) {
    case 'fill':
      return fill(id, el, a.value, a.overwrite);
    case 'clear':
      return fill(id, el, '', a.overwrite);
    case 'select_option':
      return selectOption(id, el, a.value, a.overwrite);
    case 'set_checked':
      return setChecked(id, el, a.checked);
    case 'upload_file':
      return uploadResume(id, el, a.file);
    case 'click':
      return click(el);
    case 'scroll_to':
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return { ok: true, value: '' };
    case 'highlight':
      highlight(id, el, a.style, a.note);
      return { ok: true, value: '' };
  }
}
