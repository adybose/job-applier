// Real-model smoke test of Gemma's vision. Run with: LAZYAPPLY_OLLAMA=1 pnpm vitest run ocr.ollama
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModelClient } from '../model/client';
import { DEFAULT_MODEL_SETTINGS } from '../model/settings';
import { MemoryStatsSink } from '../model/stats';
import { extractProfile } from './extract';
import { fillScannedPages } from './ocr';

const model = process.env.LAZYAPPLY_OLLAMA_MODEL ?? DEFAULT_MODEL_SETTINGS.mapping.model;

/** The fixture is one JPEG wrapped in a PDF; pull the JPEG out instead of rendering (no canvas in Node). */
function jpegFromFixture(): string {
  const pdf = readFileSync(join(import.meta.dirname, '../../../../fixtures/profiles/alex-rivera-scanned.pdf'));
  const head = pdf.indexOf('/DCTDecode');
  const length = Number(/\/Length (\d+)/.exec(pdf.subarray(head, head + 200).toString('latin1'))?.[1]);
  const start = pdf.indexOf('stream\n', head) + 'stream\n'.length;
  return pdf.subarray(start, start + length).toString('base64');
}

describe.runIf(process.env.LAZYAPPLY_OLLAMA === '1')(`scanned CV with ${model}`, () => {
  it('transcribes the page image and extracts the profile', async () => {
    const stats = new MemoryStatsSink();
    const client = new ModelClient({ ...DEFAULT_MODEL_SETTINGS, mapping: { model, numCtx: 8192 } }, { fetch, now: () => performance.now(), stats });
    const { pdf } = await fillScannedPages({ pages: [''], text: '' }, new ArrayBuffer(0), {
      client,
      render: async () => [jpegFromFixture()],
    });
    console.log(pdf.text, stats.rows.at(-1));
    const result = await extractProfile(client, pdf.text, 'cv', 8192);
    const data = result.ok ? result.data : result.partial;
    console.log(JSON.stringify({ name: data.fullName, email: data.email, jobs: data.experience.map((e) => e.company) }));
    console.log(JSON.stringify(stats.rows.map((r) => ({ prompt: r.promptId, ms: Math.round(r.latencyMs), out: r.outputTokens, ok: r.ok }))));
    expect(data.fullName).toBe('Alex Rivera');
    expect(data.email).toBe('alex.rivera@example.com');
    // OCR can misread a word ("Globelex"); that is what the one-time profile review is for.
    expect(data.experience.map((e) => e.company)).toEqual([expect.stringMatching(/^Glob\w*ex Robotics$/), 'Initech']);
  }, 300_000);
});
