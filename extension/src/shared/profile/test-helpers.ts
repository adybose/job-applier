import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ModelClient } from '../model/client';
import { DEFAULT_MODEL_SETTINGS } from '../model/settings';
import { MemoryStatsSink } from '../model/stats';
import type { GetDocument } from './pdf';
import type { ExtractedProfile } from './schema';

const ROOT = join(import.meta.dirname, '../../../..');

export const nodeGetDocument = ((params: { data: Uint8Array }) =>
  getDocument({ ...params, verbosity: 0 })) as unknown as GetDocument;

export function fixtureBytes(name: 'alex-rivera-cv.pdf' | 'alex-rivera-linkedin.pdf'): ArrayBuffer {
  const buf = readFileSync(join(ROOT, 'fixtures/profiles', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export function recording(name: string): ExtractedProfile {
  return JSON.parse(readFileSync(join(ROOT, 'mock-model/recordings', `${name}.json`), 'utf8')).response;
}

/** A ModelClient whose Ollama replies come from `reply` in order; records the chat bodies it sent. */
export function scriptedClient(replies: string[]) {
  const sent: { messages: { role: string; content: string }[] }[] = [];
  const fetchFn = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    const content = replies.shift() ?? '{}';
    return new Response(JSON.stringify({ message: { content }, eval_count: 1, eval_duration: 1e9 }));
  }) as typeof fetch;
  const client = new ModelClient(DEFAULT_MODEL_SETTINGS, { fetch: fetchFn, now: () => 0, stats: new MemoryStatsSink() });
  return { client, sent };
}
