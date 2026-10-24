import { byIdInRoot, cleanLabel, FORM_CONTROL, textOf } from './dom';

function labelledBy(el: Element): string {
  const ids = el.getAttribute('aria-labelledby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => textOf(byIdInRoot(el, id)))
    .filter(Boolean)
    .join(' ');
}

function labelFor(el: Element): string {
  if (!el.id) return '';
  const root = el.getRootNode() as Document | ShadowRoot;
  const label = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
  return textOf(label);
}

/** Text of the wrapping label, minus the branch that holds the control (Lever puts upload buttons there). */
function wrappingLabel(el: Element): string {
  const label = el.closest('label');
  if (!label) return '';
  let branch: Node = el;
  while (branch.parentNode && branch.parentNode !== label) branch = branch.parentNode;
  return Array.from(label.childNodes)
    .filter((n) => n !== branch)
    .map((n) => (n.nodeType === Node.TEXT_NODE ? (n.textContent ?? '') : textOf(n)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function legend(el: Element): string {
  const fieldset = el.closest('fieldset');
  return textOf(fieldset?.querySelector(':scope > legend'));
}

/** Nearest preceding text within the field's container (R-PP-4 step 6). */
export function precedingText(el: Element, maxDepth = 3): string {
  let node: Element | null = el;
  for (let depth = 0; node && depth < maxDepth; depth++) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (sib.matches(FORM_CONTROL) || sib.querySelector(FORM_CONTROL) || sib.tagName === 'LABEL') return '';
      const text = textOf(sib);
      if (text && text.length < 300) return text;
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
    if (node && (node.tagName === 'FORM' || node.tagName === 'BODY')) break;
  }
  return '';
}

/**
 * Spec 03 R-PP-4: label[for], wrapping label, aria-labelledby, aria-label, fieldset legend,
 * nearest preceding text, placeholder, name.
 */
export function resolveLabel(el: Element): string {
  return resolveLabelWithRaw(el).label;
}

/** The cleaned label plus the raw text it came from (which may end in a required marker). */
export function resolveLabelWithRaw(el: Element): { label: string; raw: string } {
  const strategies = [
    () => labelFor(el),
    () => wrappingLabel(el),
    () => labelledBy(el),
    () => el.getAttribute('aria-label') ?? '',
    () => legend(el),
    () => precedingText(el),
    () => el.getAttribute('placeholder') ?? '',
    () => el.getAttribute('name') ?? '',
  ];
  for (const strategy of strategies) {
    const raw = strategy();
    const label = cleanLabel(raw);
    if (label) return { label, raw };
  }
  return { label: '', raw: '' };
}

/** Label for a group of radios: the legend when the fieldset holds exactly this group, else the text before it. */
export function resolveGroupLabel(radios: readonly HTMLInputElement[]): string {
  const first = radios[0];
  if (!first) return '';
  const container = commonAncestor(radios);
  const fieldset = first.closest('fieldset');
  if (fieldset && container && fieldset.contains(container)) {
    // Use the legend only when the fieldset holds nothing but this group.
    const controls = fieldset.querySelectorAll(FORM_CONTROL);
    const onlyThisGroup = Array.from(controls).every(
      (c) => c instanceof HTMLInputElement && c.type === 'radio' && c.name === first.name,
    );
    if (onlyThisGroup) {
      const text = cleanLabel(legend(first));
      if (text) return text;
    }
  }
  const labelled = container?.closest('[aria-labelledby]');
  const text =
    cleanLabel(labelled ? labelledBy(labelled) : '') ||
    cleanLabel(precedingText(first.closest('label') ?? first, 4)) ||
    cleanLabel(legend(first)) ||
    cleanLabel(first.name);
  return text;
}

export function commonAncestor(els: readonly Element[]): Element | null {
  const first = els[0];
  if (!first) return null;
  let node: Element | null = first.parentElement;
  while (node && !els.every((e) => node?.contains(e))) node = node.parentElement;
  // Step up past wrapping labels so preceding-text lookup starts outside the options.
  while (node && node.tagName === 'LABEL') node = node.parentElement;
  return node;
}

/** Help text: aria-describedby, else a hint/help/description element in the field's container. */
export function resolveHelpText(el: Element, label: string): string | undefined {
  const describedBy = el.getAttribute('aria-describedby');
  if (describedBy) {
    const text = describedBy
      .split(/\s+/)
      .map((id) => textOf(byIdInRoot(el, id)))
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }
  const container = el.closest('.field, li, .form-group, [class*="field-entry"], [class*="question"]');
  const hint = container?.querySelector('[class*="hint"], [class*="help"], [class*="description"]');
  const text = textOf(hint);
  return text && text !== label ? text : undefined;
}

/** Nearest heading or legend before the field (R-PP-2 `section`). */
export function resolveSection(el: Element): string | undefined {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 8; depth++) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName) || sib.tagName === 'LEGEND') return textOf(sib) || undefined;
      const heading = sib.querySelector?.('h1, h2, h3, h4, h5, h6');
      if (heading && !sib.querySelector(FORM_CONTROL)) return textOf(heading) || undefined;
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return undefined;
}
