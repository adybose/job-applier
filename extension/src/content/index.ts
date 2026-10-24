import { browser } from 'wxt/browser';
import type { ActionResult } from '../shared/actions';
import type { FormSnapshot, Option } from '../shared/snapshot';
import { perform } from './actions';
import { readComboboxOptions } from './combobox';
import { OVERLAY_ATTR } from './overlay';
import { buildSnapshot } from './snapshot';

export interface ContentApi {
  snapshot(): FormSnapshot;
  readOptions(fieldId: string): Promise<Option[]>;
  act(action: unknown): Promise<ActionResult>;
}

declare global {
  // The content script's isolated world is shared by every injection, so this guards re-injection.
  var __lazyApply: ContentApi | undefined;
}

function watchMutations(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver((records) => {
    const ours = records.every(
      (r) => r.target instanceof Element && (r.target.closest(`[${OVERLAY_ATTR}]`) || r.attributeName?.startsWith('data-lazyapply')),
    );
    if (ours) return;
    clearTimeout(timer);
    // Spec 03 R-PP-12: debounced re-snapshot signal.
    timer = setTimeout(() => {
      void browser.runtime.sendMessage({ type: 'dom-changed', url: location.href }).catch(() => undefined);
    }, 400);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'disabled', 'aria-hidden'] });
}

export function startContent(): void {
  if (globalThis.__lazyApply) return;
  globalThis.__lazyApply = {
    snapshot: () => buildSnapshot(document),
    readOptions: readComboboxOptions,
    act: perform,
  };
  watchMutations();
}
