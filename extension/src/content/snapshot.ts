import { isNavLike, isSubmitLike } from '../shared/policy/buttons';
import type { Button, Field, FormSnapshot } from '../shared/snapshot';
import { findBlockers } from './blockers';
import { cleanLabel, deepElements, textOf } from './dom';
import {
  constraints,
  currentValue,
  fieldKind,
  isActionable,
  isRequired,
  radioOptions,
  selectOptions,
} from './fields';
import { extractJobDescription, extractStepHint } from './jd';
import {
  commonAncestor,
  precedingText,
  resolveGroupLabel,
  resolveHelpText,
  resolveLabelWithRaw,
  resolveSection,
} from './labels';
import { groupIdFor, idFor } from './registry';

const CONTROL_SELECTOR =
  'input, select, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="combobox"]';
const BUTTON_SELECTOR = 'button, input[type=submit], input[type=button], [role=button]';
const YES_NO = /^(yes|no)$/i;

/** Raw label text before cleaning, to detect a trailing required marker. */
function rawLabel(el: Element, label: string): string {
  const container = el.closest('label, .field, li, [class*="field-entry"], [class*="question"], fieldset');
  const marker = container?.querySelector('.asterisk, .required, [class*="required"]');
  return marker ? `${label} *` : label;
}

function widgetFor(el: Element): Field['widget'] {
  if (el.closest('.select__container, [data-combobox], [class*="react-select"]')) return 'react-select';
  if (el.getAttribute('role') === 'combobox' && !(el instanceof HTMLSelectElement)) return 'aria-combobox';
  return 'native';
}

function buildField(el: Element, group?: HTMLInputElement[]): Field | undefined {
  const kind = fieldKind(el);
  // A React-Select's hidden input and an ARIA combobox's inner listbox are not separate fields.
  if (kind === 'unknown') return undefined;

  const { label, raw } = group ? { label: resolveGroupLabel(group), raw: '' } : resolveLabelWithRaw(el);
  const name = el.getAttribute('name') ?? undefined;
  const signature = `${kind}|${name ?? ''}|${label}`;
  const id = group ? groupIdFor(group, signature) : idFor(el, 'f', signature);
  const value = currentValue(el, kind, group);
  const field: Field = {
    id,
    frameId: 0,
    kind,
    widget: widgetFor(el),
    label,
    helpText: resolveHelpText(el, label),
    required: group
      ? group.some((r) => r.required) || isRequired(el, rawLabel(el, label))
      : isRequired(el, raw) || isRequired(el, rawLabel(el, label)),
    value,
    constraints: constraints(el),
    section: resolveSection(group ? (commonAncestor(group) ?? el) : el),
    autocomplete: el.getAttribute('autocomplete') ?? undefined,
    name,
  };
  if (el instanceof HTMLSelectElement) field.options = selectOptions(el);
  if (group) field.options = radioOptions(group);
  return field;
}

/** Ashby-style Yes/No button pairs become a radio-group operated by clicking buttons. */
function toggleGroupField(container: Element, buttons: HTMLElement[]): Field {
  const label =
    cleanLabel(
      (container.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .map((id) => textOf((container.getRootNode() as Document).getElementById?.(id)))
        .join(' '),
    ) || cleanLabel(precedingText(container));
  const id = idFor(container, 'f', `toggle|${label}`);
  const pressed = buttons.find((b) => b.getAttribute('aria-pressed') === 'true');
  return {
    id,
    frameId: 0,
    kind: 'radio-group',
    widget: 'toggle-buttons',
    label,
    required: isRequired(container, rawLabel(container, label)),
    value: pressed ? textOf(pressed) : '',
    options: buttons.map((b) => ({ value: textOf(b), label: textOf(b) })),
    constraints: {},
    section: resolveSection(container),
  };
}

function buildButton(el: HTMLElement): Button {
  const descriptor = {
    text: textOf(el) || (el as HTMLInputElement).value || '',
    value: (el as HTMLInputElement).value || undefined,
    ariaLabel: el.getAttribute('aria-label') ?? undefined,
    title: el.getAttribute('title') ?? undefined,
    name: el.getAttribute('name') ?? undefined,
    type: (el.getAttribute('type') ?? (el.tagName === 'BUTTON' ? 'submit' : 'button')).toLowerCase(),
  };
  return {
    id: idFor(el, 'b', `${descriptor.type}|${descriptor.text}`),
    frameId: 0,
    text: descriptor.text,
    type: descriptor.type,
    ariaLabel: descriptor.ariaLabel,
    isSubmitLike: isSubmitLike(descriptor),
    isNavLike: isNavLike(descriptor),
  };
}

/** Spec 03: the snapshot of this frame's document, including open shadow roots. */
export function buildSnapshot(doc: Document = document): FormSnapshot {
  const fields: Field[] = [];
  const buttons: Button[] = [];
  const seenGroups = new Set<string>();
  const toggleContainers = new Set<Element>();
  const all = deepElements(doc);

  for (const el of all) {
    if (el.matches(BUTTON_SELECTOR)) {
      const htmlEl = el as HTMLElement;
      if (!isActionable(htmlEl)) continue;
      const parent = htmlEl.parentElement;
      const siblings = parent ? Array.from(parent.children).filter((c): c is HTMLElement => c.matches(BUTTON_SELECTOR)) : [];
      if (parent && siblings.length === 2 && siblings.every((b) => YES_NO.test(textOf(b)))) {
        if (!toggleContainers.has(parent)) {
          toggleContainers.add(parent);
          fields.push(toggleGroupField(parent, siblings));
        }
        continue;
      }
      buttons.push(buildButton(htmlEl));
    } else if (el.matches(CONTROL_SELECTOR)) {
      if (!isActionable(el)) continue;
      if (el instanceof HTMLInputElement && el.type === 'radio') {
        const key = `${el.form?.id ?? ''}|${el.name}`;
        if (!el.name || seenGroups.has(key)) {
          if (!el.name) {
            const f = buildField(el, [el]);
            if (f) fields.push(f);
          }
          continue;
        }
        seenGroups.add(key);
        const root = el.getRootNode() as Document | ShadowRoot;
        const group = Array.from(root.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(el.name)}"]`)).filter(
          (r) => isActionable(r),
        );
        const f = buildField(el, group);
        if (f) fields.push(f);
        continue;
      }
      // Skip ARIA textboxes nested inside another control (for example a combobox's input wrapper).
      if (el.parentElement?.closest(CONTROL_SELECTOR) && !(el instanceof HTMLInputElement)) continue;
      const f = buildField(el);
      if (f) fields.push(f);
    }
  }

  return {
    frameId: 0,
    url: doc.location?.href ?? '',
    title: doc.title,
    stepHint: extractStepHint(doc),
    jobDescription: extractJobDescription(doc),
    fields,
    buttons,
    blockers: findBlockers(doc),
  };
}
