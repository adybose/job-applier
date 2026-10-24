import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { initialState, type RunState } from '../../shared/agent/machine';
import { createModelClient } from '../../shared/model';
import { loadModelSettings } from '../../shared/model/settings';
import { getFile } from '../../shared/profile/files';
import { loadProfile, saveProfile } from '../../shared/profile/storage';
import * as page from '../page';
import { createDrafter } from './drafter';
import { Runner } from './runner';

/** The tab this panel works on: `?tabId=` (tests) or the active tab when the panel opened. */
export async function currentTabId(): Promise<number | undefined> {
  const fromQuery = Number(new URLSearchParams(location.search).get('tabId'));
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

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

  async function start(): Promise<'no-profile' | 'no-tab' | 'started'> {
    setError(null);
    const [profile, settings, resume, linkedin] = await Promise.all([
      loadProfile(),
      loadModelSettings(),
      getFile('resume'),
      getFile('linkedin'),
    ]);
    if (!profile) return 'no-profile';
    const id = tabId.current ?? (await currentTabId());
    if (!id) {
      setError('Open a job application page first.');
      return 'no-tab';
    }
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
    });
    runner.current = r;
    setCurrent(r);
    r.subscribe(setState);
    void r.start();
    return 'started';
  }

  return { state, error, start, runner: current };
}
