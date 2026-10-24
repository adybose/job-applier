import { chromium, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { alexProfile } from './seed';
import { findViolations, type ExtensionRequest } from './guard';

export const USE_OLLAMA = process.env.LAZYAPPLY_E2E_OLLAMA === '1';
export const MODEL_ORIGIN = USE_OLLAMA ? 'http://localhost:11434' : 'http://127.0.0.1:11435';
export const MOCK_ORIGIN = 'http://127.0.0.1:11435';
/** The default endpoint is configured until each test points the panel at the model under test. */
export const DEFAULT_MODEL_ORIGIN = 'http://localhost:11434';
export const ALLOWED_MODEL_ORIGINS = [MODEL_ORIGIN, DEFAULT_MODEL_ORIGIN];
export const FIXTURE_ORIGIN = 'http://127.0.0.1:4173';
export const FIXTURE_ORIGIN_2 = 'http://127.0.0.1:4174';

const EXTENSION_PATH = resolve(import.meta.dirname, '../extension/.output/chrome-mv3');

/** The slice of the chrome API used inside page.evaluate calls on extension pages. */
export interface ChromeGlobal {
  chrome: {
    storage: {
      local: {
        get(key: string | null): Promise<Record<string, unknown>>;
        set(items: Record<string, unknown>): Promise<void>;
      };
    };
  };
}

interface Fixtures {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  extensionRequests: ExtensionRequest[];
  /** Opens the side panel UI in a tab, pointed at the model endpoint under test. */
  openPanel: (query?: string) => Promise<Page>;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  extensionRequests: async ({ context, extensionId }, use) => {
    const log: ExtensionRequest[] = [];
    context.on('request', (request) => {
      if (request.serviceWorker()) {
        log.push({ url: request.url(), source: 'service-worker' });
        return;
      }
      const frameUrl = request.frame().url();
      if (frameUrl.startsWith(`chrome-extension://${extensionId}/`)) {
        log.push({ url: request.url(), source: 'extension-page' });
      }
    });
    await use(log);
    // Every test doubles as a network-guard test.
    const violations = findViolations(log, extensionId, ALLOWED_MODEL_ORIGINS);
    if (violations.length) {
      throw new Error(`Extension made requests outside the model endpoint:\n${violations.map((v) => v.url).join('\n')}`);
    }
  },

  openPanel: async ({ context, extensionId, extensionRequests: _ }, use) => {
    await use(async (query = '') => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/sidepanel.html${query}`);
      await page.evaluate(async (endpoint) => {
        const storage = (globalThis as unknown as ChromeGlobal).chrome.storage.local;
        const key = 'settings.model.v1';
        const stored = (await storage.get(key))[key] as Record<string, unknown> | undefined;
        await storage.set({
          [key]: {
            apiStyle: 'ollama',
            sameModelForBoth: true,
            mapping: { model: 'gemma3:4b-it-qat', numCtx: 16384 },
            drafting: { model: 'gemma3:4b-it-qat', numCtx: 16384 },
            timeoutMs: 120000,
            ...stored,
            endpoint,
          },
        });
      }, MODEL_ORIGIN);
      await page.reload();
      return page;
    });
  },
});

export const expect = test.expect;

/** Opens a fixture in a new tab and returns its tab id as the extension sees it. */
export async function openFixture(context: BrowserContext, panel: Page, path: string): Promise<{ page: Page; tabId: number }> {
  const page = await context.newPage();
  await page.goto(`${FIXTURE_ORIGIN}/${path}`);
  await page.waitForLoadState('load');
  const tabId = await panel.evaluate(async (url) => {
    const tabs = await (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id: number; url: string }[]> } } }).chrome.tabs.query({});
    return tabs.find((t) => t.url === url)?.id ?? -1;
  }, `${FIXTURE_ORIGIN}/${path}`);
  if (tabId < 0) throw new Error(`tab for ${path} not found`);
  return { page, tabId };
}

type PanelHelpers = typeof import('../extension/src/sidepanel/page');

/** Runs one of the side panel's page helpers (extension/src/sidepanel/page.ts) inside the panel. */
export function panelCall<K extends keyof PanelHelpers>(
  panel: Page,
  name: K,
  ...args: Parameters<PanelHelpers[K]>
): Promise<Awaited<ReturnType<PanelHelpers[K]>>> {
  return panel.evaluate(
    async ([n, a]) => {
      const helpers = (globalThis as unknown as { __lazyApplyPanel: Record<string, (...x: unknown[]) => unknown> }).__lazyApplyPanel;
      return (await helpers[n as string]?.(...(a as unknown[]))) as never;
    },
    [name, args] as const,
  ) as Promise<Awaited<ReturnType<PanelHelpers[K]>>>;
}

export async function mockMode(mode: 'ok' | 'invalid-json' | 'forbidden' | 'error', extra: Record<string, unknown> = {}) {
  await fetch(`${MOCK_ORIGIN}/__mock/mode`, { method: 'POST', body: JSON.stringify({ mode, ...extra }) });
}

export async function mockReset() {
  await fetch(`${MOCK_ORIGIN}/__mock/reset`, { method: 'POST' });
}

export async function mockRequests(): Promise<{ method: string; path: string; body: Record<string, unknown> }[]> {
  return (await fetch(`${MOCK_ORIGIN}/__mock/requests`)).json();
}

/** Saves the fictional Alex Rivera profile and CV straight into extension storage. */
export async function seedProfile(panel: Page, options: { askSalary?: boolean } = {}): Promise<void> {
  const profile = alexProfile();
  if (options.askSalary) profile.salaryExpectation = { value: { askEachTime: true }, source: 'user' };
  const cv = readFileSync(resolve(import.meta.dirname, '../fixtures/profiles/alex-rivera-cv.pdf')).toString('base64');
  await panel.evaluate(
    async ([p, b64]) => {
      const t = (globalThis as unknown as { __lazyApplyTest: { saveProfile(p: unknown): Promise<unknown>; saveFile(f: unknown): Promise<unknown> } })
        .__lazyApplyTest;
      await t.saveProfile(p);
      await t.saveFile({ kind: 'resume', name: 'alex-rivera-cv.pdf', base64: b64 });
    },
    [profile, cv] as const,
  );
}

export const submitClicks = (page: Page) => page.evaluate(() => (window as unknown as { __submitClicks: number }).__submitClicks);

/**
 * Seeds the profile, opens the fixture and a run panel bound to it, and presses Start. Like the real
 * side panel, the job page stays the visible tab: background tabs get their timers throttled or frozen.
 */
export async function startRun(
  context: BrowserContext,
  openPanel: (query?: string) => Promise<Page>,
  fixture: string,
  options: { prepare?: (page: Page) => Promise<void>; askSalary?: boolean } = {},
): Promise<{ page: Page; panel: Page; tabId: number }> {
  const setup = await openPanel();
  await seedProfile(setup, { askSalary: options.askSalary });
  const { page, tabId } = await openFixture(context, setup, fixture);
  if (options.prepare) await options.prepare(page);
  const panel = await openPanel(`?tabId=${tabId}`);
  await setup.close();
  await panel.getByRole('button', { name: 'Run', exact: true }).click();
  await panel.getByRole('button', { name: 'Start' }).click();
  await page.bringToFront();
  return { page, panel, tabId };
}
