import type { Field, FieldKind, Option } from '../shared/snapshot';
import { textOf } from './dom';

export type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLElement;

/** Spec 03 R-PP-2 kinds. */
export function fieldKind(el: Element): FieldKind {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement) {
    if (el.getAttribute('role') === 'combobox') return 'combobox';
    switch (el.type) {
      case 'text':
      case 'search':
        return 'text';
      case 'email':
      case 'tel':
      case 'url':
      case 'number':
      case 'date':
      case 'checkbox':
      case 'file':
      case 'password':
        return el.type;
      case 'month':
      case 'datetime-local':
        return 'date';
      case 'radio':
        return 'radio-group';
      default:
        return 'unknown';
    }
  }
  if (el.getAttribute('role') === 'combobox') return 'combobox';
  if (el instanceof HTMLElement && (el.isContentEditable || el.getAttribute('role') === 'textbox')) return 'contenteditable';
  return 'unknown';
}

export function hiddenByStyle(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null)) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    if (node.hasAttribute('hidden')) return true;
  }
  return false;
}

/** Spec 03 R-PP-9: skip hidden, disabled, zero-size and honeypot fields. */
export function isActionable(el: Element): boolean {
  if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
  if ((el as HTMLInputElement).disabled) return false;
  if (el.closest('[aria-hidden="true"]') && !(el instanceof HTMLInputElement && el.type === 'file')) return false;

  const isFile = el instanceof HTMLInputElement && el.type === 'file';
  // ATS upload buttons often hide the real file input; judge it by its container instead.
  const judged = isFile ? (el.parentElement ?? el) : el;
  if (hiddenByStyle(judged)) return false;
  if (isFile) return true;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    // Custom-styled radios and checkboxes are often zero-size with a visible label.
    const custom = el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox');
    if (!custom || !el.closest('label')) return false;
  }
  if (isHoneypot(el, rect)) return false;
  return true;
}

export function isHoneypot(el: Element, rect = el.getBoundingClientRect()): boolean {
  const offscreen = rect.right < -100 || rect.bottom < -100 || rect.left > window.innerWidth + 2000;
  if (offscreen) return true;
  const decoy = /honeypot|hp_|_hp\b|bot.?trap|leave.?(this|blank)/i;
  const names = `${el.getAttribute('name') ?? ''} ${el.className}`;
  return el.getAttribute('tabindex') === '-1' && decoy.test(names);
}

export function isRequired(el: Element, rawLabel: string): boolean {
  if ((el as HTMLInputElement).required) return true;
  if (el.getAttribute('aria-required') === 'true') return true;
  return /[*✱]\s*$/u.test(rawLabel.trim());
}

const PLACEHOLDER_OPTION = /^(select|choose|please select|pick|--+|—|\s*)(\s.*)?$/i;

export function selectOptions(el: HTMLSelectElement): Option[] {
  return Array.from(el.options)
    .filter((o) => !(o.value === '' && PLACEHOLDER_OPTION.test(o.text.trim())))
    .map((o) => ({ value: o.value, label: o.text.trim() }));
}

export function radioOptions(radios: readonly HTMLInputElement[]): Option[] {
  return radios.map((r) => ({ value: r.value, label: radioLabel(r) }));
}

export function radioLabel(r: HTMLInputElement): string {
  const root = r.getRootNode() as Document | ShadowRoot;
  const byFor = r.id ? root.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null;
  return textOf(byFor) || textOf(r.closest('label')) || r.getAttribute('aria-label') || r.value;
}

export function currentValue(el: Element, kind: FieldKind, group?: readonly HTMLInputElement[]): string {
  switch (kind) {
    case 'radio-group': {
      const checked = group?.find((r) => r.checked);
      return checked ? radioLabel(checked) : '';
    }
    case 'checkbox':
      return (el as HTMLInputElement).checked ? 'true' : 'false';
    case 'select': {
      const s = el as HTMLSelectElement;
      return s.value ? (s.selectedOptions[0]?.text.trim() ?? s.value) : '';
    }
    case 'file': {
      const files = (el as HTMLInputElement).files;
      return files && files.length ? Array.from(files, (f) => f.name).join(', ') : '';
    }
    case 'contenteditable':
      return textOf(el);
    case 'combobox': {
      const container = el.closest('.select__container, [class*="-container"], [data-combobox]');
      const single = container?.querySelector('.select__single-value, [class*="singleValue"], [class*="single-value"]');
      return textOf(single) || (el as HTMLInputElement).value || '';
    }
    default:
      return (el as HTMLInputElement).value ?? '';
  }
}

export function constraints(el: Element): Field['constraints'] {
  const out: Field['constraints'] = {};
  const input = el as HTMLInputElement;
  if (typeof input.maxLength === 'number' && input.maxLength > 0) out.maxLength = input.maxLength;
  if (input.pattern) out.pattern = input.pattern;
  if (el.getAttribute('accept')) out.accept = el.getAttribute('accept') ?? undefined;
  if (el.getAttribute('min')) out.min = el.getAttribute('min') ?? undefined;
  if (el.getAttribute('max')) out.max = el.getAttribute('max') ?? undefined;
  return out;
}
