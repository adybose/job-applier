import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { initialState, type RunState } from '../../shared/agent/machine';
import { createModelClient } from '../../shared/model';
import { loadModelSettings } from '../../shared/model/settings';
import { getFile } from '../../shared/profile/files';
import { loadProfile, saveProfile } from '../../shared/profile/storage';
import * as page from '../page';
import { listAnswers, markUsed, saveAnswer, setEmbedding } from '../../shared/memory/answers';
import { prefixFor, resolveEmbeddingModel } from '../../shared/memory/semantic';
import type { ModelClient } from '../../shared/model/client';
import { recordRun } from '../../shared/stats/runs';
import { ensureAccess } from './access';
import { createDrafter } from './drafter';
import { Runner } from './runner';

/** The tab this panel works on: `?tabId=` (tests) or the active tab when the panel opened. */
export async function currentTabId(): Promise<number | undefined> {
  const fromQuery = Number(new URLSearchParams(location.search).get('tabId'));
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

export type RunHandle = ReturnType<typeof useRun>;

/** Owned by App so a run survives switching views; it ends when the panel closes. */
export function useRun() {
  const [state, setState] = useState<RunState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const runner = useRef<Runner | null>(null);
  const [current, setCurrent] = useState<Runner | null>(null);
  const tabId = useRef<number | undefined>(undefined);

  useEffect(() => {
    void currentTabId().then((id) => (tabId.current = id));
    // Spec 03 R-PP-12: the content script signals DOM changes; only our own tab counts (R-PS-13).
    const onMessage = (msg: unknown, sender: { tab?: { id?: number } }) => {
      if ((msg as { type?: string }).type === 'dom-changed' && sender.tab?.id === tabId.current) void runner.current?.poll();
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      void runner.current?.stop();
    };
  }, []);

  async function start(): Promise<'no-profile' | 'no-tab' | 'no-access' | 'started'> {
    setError(null);
    // Ask for site access first, while the Start click still counts as a user gesture.
    const id = tabId.current ?? (await currentTabId());
    if (!id) {
      setError('Open a job application page first.');
      return 'no-tab';
    }
    const access = await ensureAccess(id);
    if (!access.ok) {
      setError(access.message);
      return 'no-access';
    }
    const [profile, settings, resume, linkedin] = await Promise.all([
      loadProfile(),
      loadModelSettings(),
      getFile('resume'),
      getFile('linkedin'),
    ]);
    if (!profile) return 'no-profile';
    tabId.current = id;
    await runner.current?.stop();
    const client = createModelClient(settings);
    const r = new Runner({
      tabId: id,
      page,
      client,
      settings,
      profile,
      mapperContext: { hasResume: !!resume, hasLinkedinPdf: !!linkedin },
      drafter: createDrafter(client, settings),
      saveProfile: (p) => saveProfile(p, []),
      memory: {
        list: () => listAnswers(),
        save: (a) => saveAnswer(a),
        markUsed: (k) => markUsed(k),
        embed: embedderFor(client, settings.embeddingModel),
        setEmbedding: (k, v, m) => setEmbedding(k, v, m),
      },
      recordRun: (run) => recordRun(run),
    });
    runner.current = r;
    setCurrent(r);
    r.subscribe(setState);
    void r.start();
    return 'started';
  }

  return { state, error, start, runner: current };
}

/** Embeddings with the configured memory model, resolved once per run; undefined when none is installed. */
function embedderFor(client: ModelClient, setting: string) {
  let model: Promise<string | undefined> | undefined;
  return async (texts: string[]) => {
    model ??= client
      .listModels()
      .then((installed) => resolveEmbeddingModel(setting, installed))
      .catch(() => undefined);
    const name = await model;
    if (!name || !texts.length) return undefined;
    return { model: name, vectors: await client.embed(name, texts.map((t) => prefixFor(name) + t)) };
  };
}
