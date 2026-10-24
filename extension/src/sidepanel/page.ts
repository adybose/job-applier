import { browser } from 'wxt/browser';
import { FormSnapshotSchema, mergeSnapshots, type FormSnapshot, type Option } from '../shared/snapshot';
import type { ContentApi } from '../content';

const CONTENT_SCRIPT = '/content-scripts/content.js';

/** Injects the content script into every frame of the tab (spec 03 R-PP-8). Safe to call repeatedly. */
export async function injectContent(tabId: number): Promise<void> {
  await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_SCRIPT] });
}

/** Snapshots every frame and merges them, tagging each item with its frameId. */
export async function snapshotTab(tabId: number): Promise<FormSnapshot> {
  const results = await browser.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => (globalThis as unknown as { __lazyApply?: ContentApi }).__lazyApply?.snapshot() ?? null,
  });
  const frames: FormSnapshot[] = [];
  for (const r of results) {
    const parsed = FormSnapshotSchema.safeParse(r.result);
    if (parsed.success) frames.push({ ...parsed.data, frameId: r.frameId });
  }
  return mergeSnapshots(frames);
}

export async function readOptions(tabId: number, frameId: number, fieldId: string): Promise<Option[]> {
  const [result] = await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (id: string) => (globalThis as unknown as { __lazyApply?: ContentApi }).__lazyApply?.readOptions(id) ?? [],
    args: [fieldId],
  });
  return (result?.result as Option[] | undefined) ?? [];
}
