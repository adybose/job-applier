import { chromium, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { resolve } from 'node:path';
import { findViolations, type ExtensionRequest } from './guard';

export const USE_OLLAMA = process.env.LAZYAPPLY_E2E_OLLAMA === '1';
export const MODEL_ORIGIN = USE_OLLAMA ? 'http://localhost:11434' : 'http://127.0.0.1:11435';
export const MOCK_ORIGIN = 'http://127.0.0.1:11435';
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
  openPanel: () => Promise<Page>;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
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
    const violations = findViolations(log, extensionId, MODEL_ORIGIN);
    if (violations.length) {
      throw new Error(`Extension made requests outside the model endpoint:\n${violations.map((v) => v.url).join('\n')}`);
    }
  },

  openPanel: async ({ context, extensionId, extensionRequests: _ }, use) => {
    await use(async () => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
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

export async function mockMode(mode: 'ok' | 'invalid-json' | 'forbidden' | 'error', extra: Record<string, unknown> = {}) {
  await fetch(`${MOCK_ORIGIN}/__mock/mode`, { method: 'POST', body: JSON.stringify({ mode, ...extra }) });
}

export async function mockReset() {
  await fetch(`${MOCK_ORIGIN}/__mock/reset`, { method: 'POST' });
}

export async function mockRequests(): Promise<{ method: string; path: string; body: Record<string, unknown> }[]> {
  return (await fetch(`${MOCK_ORIGIN}/__mock/requests`)).json();
}
