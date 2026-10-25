import { describe, expect, it } from 'vitest';
import { field } from '../agent/test-fixtures';
import { ModelClient } from '../model/client';
import { DEFAULT_MODEL_SETTINGS } from '../model/settings';
import { MemoryStatsSink } from '../model/stats';
import { normalizeQuestion, type SavedAnswer } from './answers';
import { cosine, embeddingText, findSemanticMatch, prefixFor, resolveEmbeddingModel, thresholdFor } from './semantic';

const entry = (questionText: string, answer: string, embedding: number[], extra: Partial<SavedAnswer> = {}): SavedAnswer => ({
  normalizedKey: normalizeQuestion(questionText),
  questionText,
  answer,
  fieldKind: 'text',
  usedCount: 0,
  lastUsed: 0,
  sensitive: false,
  embedding,
  embeddingModel: 'embeddinggemma:latest',
  ...extra,
});

describe('semantic answer memory (spec 09 R-AM-4)', () => {
  it('picks an installed embedding model, or none', () => {
    expect(resolveEmbeddingModel('auto', ['gemma3:4b-it-qat', 'nomic-embed-text:latest', 'embeddinggemma:latest'])).toBe('embeddinggemma:latest');
    expect(resolveEmbeddingModel('auto', ['gemma3:4b-it-qat', 'nomic-embed-text:latest'])).toBe('nomic-embed-text:latest');
    expect(resolveEmbeddingModel('auto', ['gemma3:4b-it-qat'])).toBeUndefined();
    expect(resolveEmbeddingModel('off', ['embeddinggemma:latest'])).toBeUndefined();
    expect(resolveEmbeddingModel('my-embedder', [])).toBe('my-embedder');
  });

  it('computes cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 1], [2, 2])).toBeCloseTo(1);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it('matches by vector above the threshold, from the same model and a compatible kind', () => {
    const f = field('When could you start?', { kind: 'text' });
    const saved = [
      entry('Earliest start date', 'In 4 weeks', [0.9, 0.1, 0]),
      entry('Favorite color', 'Blue', [0, 0, 1]),
      entry('Old model entry', 'X', [0.9, 0.1, 0], { embeddingModel: 'other-model' }),
    ];
    expect(findSemanticMatch(f, [1, 0.1, 0], saved, 'embeddinggemma:latest', 0.82)).toMatchObject({ value: 'In 4 weeks' });
    expect(findSemanticMatch(f, [0, 1, 0], saved, 'embeddinggemma:latest', 0.82)).toBeUndefined();
    const upload = field('Start date document', { kind: 'file' });
    expect(findSemanticMatch(upload, [1, 0.1, 0], saved, 'embeddinggemma:latest', 0.82)).toBeUndefined();
  });

  it('snaps choice answers to a real option', () => {
    const f = field('Can you relocate?', { kind: 'select', options: [{ value: 'y', label: 'Yes, happy to' }, { value: 'n', label: 'No' }] });
    const saved = [entry('Willing to move to Austin?', 'Yes', [1, 0], { fieldKind: 'radio-group' })];
    expect(findSemanticMatch(f, [1, 0], saved, 'embeddinggemma:latest', 0.82)?.value).toBe('Yes, happy to');
  });

  it('uses each model\'s task prefix and calibrated threshold', () => {
    expect(prefixFor('embeddinggemma:latest')).toBe('task: search result | query: ');
    expect(prefixFor('nomic-embed-text')).toBe('search_query: ');
    expect(thresholdFor('embeddinggemma:latest')).toBe(0.56);
    expect(thresholdFor('nomic-embed-text')).toBe(0.82);
  });

  it('embeds the question without boilerplate', () => {
    expect(embeddingText('Phone number (optional) *')).toBe('Phone number');
  });

  it('calls /api/embed and /v1/embeddings', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      const ollama = String(url).endsWith('/api/embed');
      return new Response(JSON.stringify(ollama ? { embeddings: [[1, 2]] } : { data: [{ embedding: [3, 4] }] }));
    }) as typeof fetch;
    const deps = { fetch: fetchFn, now: () => 0, stats: new MemoryStatsSink() };
    expect(await new ModelClient(DEFAULT_MODEL_SETTINGS, deps).embed('embeddinggemma', ['hi'])).toEqual([[1, 2]]);
    expect(
      await new ModelClient({ ...DEFAULT_MODEL_SETTINGS, apiStyle: 'openai', endpoint: 'http://127.0.0.1:1234' }, deps).embed('e', ['hi']),
    ).toEqual([[3, 4]]);
    expect(calls.map((c) => c.url)).toEqual(['http://localhost:11434/api/embed', 'http://127.0.0.1:1234/v1/embeddings']);
    expect(calls[0]?.body).toEqual({ model: 'embeddinggemma', input: ['hi'] });
    await expect(new ModelClient(DEFAULT_MODEL_SETTINGS, deps).embed('e', ['a', 'b'])).rejects.toMatchObject({ kind: 'bad-response' });
  });
});
