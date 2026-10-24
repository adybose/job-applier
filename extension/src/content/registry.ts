// Stable ids for fields, buttons and blockers (spec 03 R-PP-2, R-PP-12, AC-PP-7).
export const ID_ATTR = 'data-lazyapply-id';

const frameToken = Math.random().toString(36).slice(2, 6);
let counter = 0;

const elements = new Map<string, WeakRef<Element>>();
const bySignature = new Map<string, string>();

export function elementFor(id: string): Element | undefined {
  const el = elements.get(id)?.deref();
  return el?.isConnected ? el : undefined;
}

/**
 * Returns the element's id, assigning one if needed. A re-rendered element with the same
 * signature (kind, name, label) gets the id its predecessor had, as long as that one is gone.
 */
export function idFor(el: Element, prefix: 'f' | 'b' | 'k', signature: string): string {
  const existing = el.getAttribute(ID_ATTR);
  if (existing && elements.get(existing)?.deref() === el) return existing;

  const previous = bySignature.get(`${prefix}|${signature}`);
  const id = previous && !elementFor(previous) ? previous : `la-${prefix}-${frameToken}-${++counter}`;
  el.setAttribute(ID_ATTR, id);
  elements.set(id, new WeakRef(el));
  bySignature.set(`${prefix}|${signature}`, id);
  return id;
}

/** Radio groups use one id for every radio in the group. */
export function groupIdFor(radios: readonly Element[], signature: string): string {
  const first = radios[0];
  if (!first) throw new Error('empty radio group');
  const id = idFor(first, 'f', signature);
  for (const r of radios) {
    r.setAttribute('data-lazyapply-group', id);
  }
  return id;
}
