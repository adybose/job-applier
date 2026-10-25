import { bestOption } from '../policy/options';
import type { Field } from '../snapshot';
import { KIND_GROUP, type MemoryMatch, type SavedAnswer } from './answers';

// Spec 09 R-AM-4 (P2): match reworded questions by embedding similarity; word overlap stays the fallback.

const KNOWN = /embeddinggemma|nomic-embed-text/i;

/** "off" → none; "auto" → the first installed EmbeddingGemma or nomic-embed-text; anything else is used as named. */
export function resolveEmbeddingModel(setting: string, installed: readonly string[]): string | undefined {
  if (setting === 'off') return undefined;
  if (setting === 'auto') return installed.find((m) => /embeddinggemma/i.test(m)) ?? installed.find((m) => KNOWN.test(m));
  return setting;
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** The text that gets embedded: the question, not boilerplate. */
export function embeddingText(question: string): string {
  return question.replace(/\(optional\)|\*/gi, '').replace(/\s+/g, ' ').trim();
}

/**
 * Task prefixes the embedding models were trained with. Measured on 12 question pairs (semantic.ollama.test.ts):
 * EmbeddingGemma with "task: search result | query: " put every paraphrase ≥ 0.594 and every unrelated pair ≤ 0.525;
 * with no prefix the two groups overlapped (0.627 vs 0.699).
 */
export function prefixFor(model: string): string {
  if (/embeddinggemma/i.test(model)) return 'task: search result | query: ';
  if (/nomic-embed-text/i.test(model)) return 'search_query: ';
  return '';
}

/** Calibrated for EmbeddingGemma (middle of the measured gap); spec default for anything else. */
export function thresholdFor(model: string): number {
  return /embeddinggemma/i.test(model) ? 0.56 : 0.82;
}

export function findSemanticMatch(
  field: Field,
  fieldVector: readonly number[],
  entries: readonly SavedAnswer[],
  model: string,
  threshold: number,
): MemoryMatch | undefined {
  const group = KIND_GROUP[field.kind];
  if (group === 'none') return undefined;
  let best: MemoryMatch | undefined;
  for (const entry of entries) {
    if (!entry.embedding || entry.embeddingModel !== model) continue;
    const entryGroup = KIND_GROUP[entry.fieldKind];
    const compatible = entryGroup === group || (group === 'long' && entryGroup === 'text') || (group === 'text' && entryGroup === 'long');
    if (!compatible) continue;
    const score = cosine(fieldVector, entry.embedding);
    if (score < threshold || (best && score <= best.score)) continue;
    let value = entry.answer;
    if (group === 'choice' && field.options?.length) {
      const option = bestOption(field.options, entry.answer);
      if (!option) continue;
      value = option.label;
    }
    best = { entry, score, value };
  }
  return best;
}
