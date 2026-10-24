import type { Option } from '../shared/snapshot';
import { textOf } from './dom';
import { elementFor } from './registry';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function comboboxContainer(input: Element): Element {
  return input.closest('.select__container, [data-combobox], [class*="-container"]') ?? input.parentElement ?? input;
}

export function openCombobox(input: HTMLElement): void {
  const control = comboboxContainer(input).querySelector('[class*="control"]') ?? input;
  control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  input.focus();
}

export function closeCombobox(input: HTMLElement): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  input.blur();
}

export function listboxFor(input: Element): Element | null {
  const controls = input.getAttribute('aria-controls') ?? input.getAttribute('aria-owns');
  const root = input.getRootNode() as Document | ShadowRoot;
  if (controls) {
    const el = root.getElementById?.(controls) ?? document.getElementById(controls);
    if (el) return el;
  }
  return comboboxContainer(input).querySelector('[role=listbox]') ?? null;
}

/** Spec 03 R-PP-10: options are read lazily by opening the control, then it is closed again. */
export async function readComboboxOptions(fieldId: string): Promise<Option[]> {
  const input = elementFor(fieldId) as HTMLElement | undefined;
  if (!input) return [];
  openCombobox(input);
  let listbox: Element | null = null;
  for (let i = 0; i < 20 && !listbox; i++) {
    await wait(25);
    listbox = listboxFor(input);
  }
  const options = listbox
    ? Array.from(listbox.querySelectorAll('[role=option]')).map((o) => ({ value: textOf(o), label: textOf(o) }))
    : [];
  closeCombobox(input);
  return options;
}
