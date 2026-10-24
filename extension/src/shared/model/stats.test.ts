import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IdbStatsSink } from './stats';

describe('IdbStatsSink', () => {
  it('stores and reads call stats', async () => {
    const sink = new IdbStatsSink('lazyapply-test-stats');
    await sink.log({
      ts: 1,
      model: 'gemma3:4b-it-qat',
      promptId: 'plan',
      promptVersion: 1,
      stage: 'planning',
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 100,
      ok: true,
    });
    expect(await sink.all()).toEqual([expect.objectContaining({ model: 'gemma3:4b-it-qat', latencyMs: 100 })]);
  });
});
