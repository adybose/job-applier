// Calibrates the semantic-memory threshold on the real model. Run with: LAZYAPPLY_OLLAMA=1 pnpm vitest run semantic.ollama
import { describe, expect, it } from 'vitest';
import { ModelClient } from '../model/client';
import { DEFAULT_MODEL_SETTINGS } from '../model/settings';
import { MemoryStatsSink } from '../model/stats';
import { cosine, embeddingText, prefixFor, thresholdFor } from './semantic';

const model = process.env.LAZYAPPLY_EMBED_MODEL ?? 'embeddinggemma';

const SAME = [
  ['Are you willing to relocate?', 'Would you consider moving to a new city for this job?'],
  ['Earliest start date', 'When could you start?'],
  ['What is your notice period?', 'How much notice do you need to give your current employer?'],
  ['Desired salary', 'What are your compensation expectations?'],
  ['How did you hear about this job?', 'Where did you find this posting?'],
  ['Will you require visa sponsorship?', 'Do you need us to sponsor a work permit?'],
] as const;

const DIFFERENT = [
  ['Are you willing to relocate?', 'Do you have a driving licence?'],
  ['Earliest start date', 'Date of birth'],
  ['Desired salary', 'How did you hear about this job?'],
  ['Will you require visa sponsorship?', 'Are you willing to relocate?'],
  ['What is your notice period?', 'Why do you want to work here?'],
  ['GitHub URL', 'Portfolio URL'],
] as const;

describe.runIf(process.env.LAZYAPPLY_OLLAMA === '1')(`embedding threshold with ${model}`, () => {
  it('separates paraphrases from different questions', async () => {
    const client = new ModelClient(DEFAULT_MODEL_SETTINGS, { fetch, now: () => performance.now(), stats: new MemoryStatsSink() });
    const score = async (pairs: readonly (readonly [string, string])[]) => {
      const prefix = process.env.LAZYAPPLY_EMBED_PREFIX ?? prefixFor(model);
      const vectors = await client.embed(model, pairs.flat().map((q) => prefix + embeddingText(q)));
      return pairs.map((p, i) => ({ pair: p.join(' ~ '), cos: Math.round(cosine(vectors[2 * i] ?? [], vectors[2 * i + 1] ?? []) * 1000) / 1000 }));
    };
    const same = await score(SAME);
    const different = await score(DIFFERENT);
    console.log('SAME', JSON.stringify(same, null, 1), '\nDIFFERENT', JSON.stringify(different, null, 1));
    const minSame = Math.min(...same.map((s) => s.cos));
    const maxDifferent = Math.max(...different.map((s) => s.cos));
    console.log({ minSame, maxDifferent });
    expect(minSame).toBeGreaterThan(maxDifferent);
    // The calibrated threshold sits in the gap.
    expect(thresholdFor(model)).toBeGreaterThan(maxDifferent);
    expect(thresholdFor(model)).toBeLessThan(minSame);
  }, 120_000);
});
