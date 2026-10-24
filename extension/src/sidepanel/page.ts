import { browser } from 'wxt/browser';
import type { ContentApi } from '../content';
import type { Action, ActionResult } from '../shared/actions';
import { getFile } from '../shared/profile/files';
import { FormSnapshotSchema, mergeSnapshots, type FormSnapshot, type Option } from '../shared/snapshot';

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

/** Sends one action to the frame that owns the field (spec 04 R-AC-2). */
export async function act(tabId: number, frameId: number, action: Action): Promise<ActionResult> {
  const [result] = await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (a: unknown) =>
      (globalThis as unknown as { __lazyApply?: ContentApi }).__lazyApply?.act(a) ??
      Promise.resolve({ ok: false, reason: 'not-found' }),
    args: [action],
  });
  return (result?.result as ActionResult | undefined) ?? { ok: false, reason: 'not-found' };
}

/** The stored resume as an upload_file payload (base64 so it can cross executeScript). */
export async function resumePayload(): Promise<{ name: string; type: string; base64: string } | undefined> {
  const file = await getFile('resume');
  if (!file) return undefined;
  const bytes = new Uint8Array(file.bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: file.name, type: file.type, base64: btoa(binary) };
}

export async function readOptions(tabId: number, frameId: number, fieldId: string): Promise<Option[]> {
  const [result] = await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (id: string) => (globalThis as unknown as { __lazyApply?: ContentApi }).__lazyApply?.readOptions(id) ?? [],
    args: [fieldId],
  });
  return (result?.result as Option[] | undefined) ?? [];
}
