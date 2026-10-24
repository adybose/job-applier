// Real-model smoke test. Run with: LAZYAPPLY_OLLAMA=1 pnpm vitest run extract.ollama
import { describe, expect, it } from 'vitest';
import { ModelClient } from '../model/client';
import { DEFAULT_MODEL_SETTINGS } from '../model/settings';
import { MemoryStatsSink } from '../model/stats';
import { extractProfile } from './extract';
import { extractPdfText } from './pdf';
import { fixtureBytes, nodeGetDocument } from './test-helpers';

const model = process.env.LAZYAPPLY_OLLAMA_MODEL ?? DEFAULT_MODEL_SETTINGS.mapping.model;
const settings = { ...DEFAULT_MODEL_SETTINGS, mapping: { model, numCtx: 8192 } };

describe.runIf(process.env.LAZYAPPLY_OLLAMA === '1')(`extraction with ${model}`, () => {
  const stats = new MemoryStatsSink();
  const client = new ModelClient(settings, { fetch, now: () => performance.now(), stats });

  it.each([
    ['alex-rivera-cv.pdf', 'cv'],
    ['alex-rivera-linkedin.pdf', 'linkedin'],
  ] as const)('extracts %s', async (file, kind) => {
    const pdf = await extractPdfText(fixtureBytes(file), nodeGetDocument);
    const result = await extractProfile(client, pdf.text, kind, 8192);
    const data = result.ok ? result.data : result.partial;
    console.log(file, JSON.stringify(data, null, 1), stats.rows.at(-1));
    expect(result.ok).toBe(true);
    expect(data.fullName).toBe('Alex Rivera');
    expect(data.experience.map((e) => e.company)).toContain('Globex Robotics');
  }, 300_000);
});
