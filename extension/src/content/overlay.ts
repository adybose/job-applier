// Spec 06 R-HL-6 / R-HL-13: highlight overlays. They never restyle the page's own elements.
export const OVERLAY_ATTR = 'data-lazyapply-overlay';

const COLORS = { handoff: '#d97706', submit: '#15803d', focus: '#2563eb' } as const;
const overlays = new Map<string, { box: HTMLElement; target: Element }>();
let ticking = false;

/** File inputs are often 1px; highlight the field around them instead. */
function visualTarget(el: Element): Element {
  const rect = el.getBoundingClientRect();
  if (rect.width > 8 && rect.height > 8) return el;
  return el.closest('.field, li, [class*="field-entry"], [class*="question"], label') ?? el.parentElement ?? el;
}

function place(box: HTMLElement, target: Element): void {
  const r = target.getBoundingClientRect();
  box.style.top = `${r.top + window.scrollY - 6}px`;
  box.style.left = `${r.left + window.scrollX - 6}px`;
  box.style.width = `${r.width + 12}px`;
  box.style.height = `${r.height + 12}px`;
}

function reposition(): void {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    for (const { box, target } of overlays.values()) {
      if (target.isConnected) place(box, target);
    }
  });
}

export function highlight(id: string, el: Element, style: keyof typeof COLORS, note?: string): void {
  clearHighlight(id);
  const target = visualTarget(el);
  const box = document.createElement('div');
  box.setAttribute(OVERLAY_ATTR, style);
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'absolute',
    zIndex: '2147483646',
    pointerEvents: 'none',
    border: `3px solid ${COLORS[style]}`,
    borderRadius: '8px',
    boxShadow: `0 0 0 4px ${COLORS[style]}33`,
    boxSizing: 'border-box',
  });
  if (note) {
    const tag = document.createElement('div');
    tag.textContent = note;
    Object.assign(tag.style, {
      position: 'absolute',
      top: '-26px',
      left: '0',
      padding: '2px 8px',
      borderRadius: '6px',
      background: COLORS[style],
      color: '#fff',
      font: '600 12px system-ui, sans-serif',
      whiteSpace: 'nowrap',
    });
    box.appendChild(tag);
  }
  document.documentElement.appendChild(box);
  place(box, target);
  overlays.set(id, { box, target });
  if (overlays.size === 1) {
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
  }
}

export function clearHighlight(id?: string): void {
  for (const [key, { box }] of overlays) {
    if (id === undefined || key === id) {
      box.remove();
      overlays.delete(key);
    }
  }
  if (overlays.size === 0) {
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
  }
}
