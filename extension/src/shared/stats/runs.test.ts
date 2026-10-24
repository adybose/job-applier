import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { listRuns, minutesSaved, recordRun, summarizeCalls } from './runs';

describe('stats', () => {
  it('estimates minutes saved per application', () => {
    expect(minutesSaved({ humanSeconds: 150 })).toBe(14.5);
    expect(minutesSaved({ humanSeconds: 30 * 60 })).toBe(0);
  });

  it('summarizes calls per model', () => {
    const base = { ts: 0, promptId: 'p', promptVersion: 1, stage: 'planning' as const, inputTokens: 0 };
    const summary = summarizeCalls([
      { ...base, model: 'gemma3:4b-it-qat', outputTokens: 100, latencyMs: 2000, ok: true },
      { ...base, model: 'gemma3:4b-it-qat', outputTokens: 50, latencyMs: 1000, ok: true },
      { ...base, model: 'gemma3:4b-it-qat', outputTokens: 0, latencyMs: 500, ok: false },
      { ...base, model: 'gemma3:12b-it-qat', outputTokens: 40, latencyMs: 2000, ok: true },
    ]);
    expect(summary).toEqual([
      { model: 'gemma3:4b-it-qat', calls: 3, failed: 1, avgLatencyMs: 1500, tokensPerSecond: 50 },
      { model: 'gemma3:12b-it-qat', calls: 1, failed: 0, avgLatencyMs: 2000, tokensPerSecond: 20 },
    ]);
  });

  it('stores runs locally', async () => {
    await recordRun({ ts: 1, host: 'boards.greenhouse.io', auto: 9, approved: 10, edited: 0, human: 1, skipped: 0, humanSeconds: 120, agentSeconds: 8 }, 'runs-test');
    expect(await listRuns('runs-test')).toHaveLength(1);
  });
});
