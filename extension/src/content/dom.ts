// DOM helpers that see through open shadow roots (spec 03 R-PP-7).

const SKIP_TEXT_IN = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SELECT', 'OPTION', 'TEXTAREA', 'TEMPLATE']);

/** Every element under root, descending into open shadow roots, in document order. */
export function deepElements(root: Document | ShadowRoot | Element): Element[] {
  const out: Element[] = [];
  const visit = (node: Document | ShadowRoot | Element) => {
    const walker = (node instanceof Element ? node.ownerDocument : node instanceof Document ? node : node.ownerDocument)
      .createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let current = walker.nextNode() as Element | null;
    while (current) {
      out.push(current);
      if (current.shadowRoot) visit(current.shadowRoot);
      current = walker.nextNode() as Element | null;
    }
  };
  visit(root);
  return out;
}

export function deepQueryAll<T extends Element = Element>(root: Document | ShadowRoot | Element, selector: string): T[] {
  return deepElements(root).filter((el) => el.matches(selector)) as T[];
}

/** Visible text of a node, skipping form controls' own option text, scripts, and aria-hidden parts. */
export function textOf(node: Node | null | undefined): string {
  if (!node) return '';
  let out = '';
  const visit = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out += n.textContent ?? '';
      return;
    }
    if (!(n instanceof Element)) return;
    if (SKIP_TEXT_IN.has(n.tagName)) return;
    if (n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('hidden')) return;
    // Web components project their labels through <slot>.
    if (n instanceof HTMLSlotElement) {
      for (const assigned of n.assignedNodes({ flatten: true })) visit(assigned);
      return;
    }
    for (const child of Array.from(n.childNodes)) visit(child);
    if (n.shadowRoot) for (const child of Array.from(n.shadowRoot.childNodes)) visit(child);
  };
  visit(node);
  return out.replace(/\s+/g, ' ').trim();
}

/** Strips required markers and trailing colons from a label (R-PP-4). */
export function cleanLabel(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*[*✱]+\s*$/u, '')
    .replace(/\s*[*✱]+\s*$/u, '')
    .replace(/:\s*$/, '')
    .trim();
}

/** Looks up an element by id in the element's own tree (document or shadow root). */
export function byIdInRoot(el: Element, id: string): Element | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  return root.getElementById?.(id) ?? (root as ShadowRoot).querySelector?.(`#${CSS.escape(id)}`) ?? null;
}

export const FORM_CONTROL = 'input, select, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="combobox"]';
