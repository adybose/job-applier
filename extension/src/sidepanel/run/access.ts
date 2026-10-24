import { browser } from 'wxt/browser';

// ADR-012: per-site access, asked for at Start. Clicking the toolbar icon grants activeTab for the
// current page; on Start we also ask for that site (so multi-step forms keep working after a page
// navigation) and for any cross-origin job-board iframe on it (such as a Greenhouse embed).

export type AccessResult = { ok: true } | { ok: false; message: string };

const pattern = (url: string): string | undefined => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? `${u.protocol}//${u.hostname}/*` : undefined;
  } catch {
    return undefined;
  }
};

async function iframeOrigins(tabId: number): Promise<string[]> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: () => Array.from(document.querySelectorAll('iframe[src]'), (f) => (f as HTMLIFrameElement).src),
    });
    return (result?.result as string[] | undefined) ?? [];
  } catch {
    return [];
  }
}

/** Must be called from the Start click (a user gesture), before any long work. */
export async function ensureAccess(tabId: number): Promise<AccessResult> {
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  const top = tab?.url ? pattern(tab.url) : undefined;
  if (!top) {
    return {
      ok: false,
      message: 'Lazy Apply needs access to this page. Click the Lazy Apply icon in the toolbar while the job page is open, then press Start.',
    };
  }
  const wanted = new Set([top]);
  for (const src of await iframeOrigins(tabId)) {
    const p = pattern(src);
    if (p && /greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|myworkdayjobs\.com|icims\.com|jobvite\.com/i.test(p)) {
      wanted.add(p);
    }
  }
  const origins = [...wanted];
  if (await browser.permissions.contains({ origins })) return { ok: true };
  const granted = await browser.permissions.request({ origins }).catch(() => false);
  return granted
    ? { ok: true }
    : { ok: false, message: 'Lazy Apply can only fill this form if you allow it on this site.' };
}
