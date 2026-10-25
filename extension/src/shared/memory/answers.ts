import { withDb } from '../db';
import { bestOption } from '../policy/options';
import type { Field, FieldKind } from '../snapshot';

// Spec 09: remembered answers, matched by normalized words (P0). Embeddings are P2.

export interface SavedAnswer {
  normalizedKey: string;
  questionText: string;
  answer: string;
  fieldKind: FieldKind;
  usedCount: number;
  lastUsed: number;
  sensitive: boolean;
  /** Spec 09 R-AM-4 (P2): the question's embedding and the model that made it. */
  embedding?: number[];
  embeddingModel?: string;
}

const STOPWORDS = new Set(
  (
    'a an the and or of to in on at for with by from as is are be been was were do does did you your yours we our us ' +
    'this that these those it its please optional required if any have has had will would could should can may might ' +
    'willing consider able currently comfortable open okay ok what which who when where how there here about ' +
    'desired expected expect preferred prefer usd eur gbp inr cad aud per annual annually year yearly'
  ).split(' '),
);

// R-AM-3: synonyms collapse to one token before comparing.
const SYNONYMS: readonly [RegExp, string][] = [
  [/^(salary|salaries|compensation|pay|wage|wages|remuneration|ctc)$/, 'salary'],
  [/^(sponsorship|sponsor|visa|visas)$/, 'sponsorship'],
  [/^(relocate|relocation|relocating|relocated|move|moving)$/, 'relocate'],
  [/^(start|starting|available|availability|join|joining)$/, 'start'],
  [/^(notice)$/, 'notice'],
  [/^(authorized|authorised|authorization|authorisation|eligible|eligibility|permitted)$/, 'authorized'],
  [/^(hear|heard|find|found|learn|learned|discover)$/, 'hear'],
];

function stem(word: string): string {
  for (const [re, to] of SYNONYMS) if (re.test(word)) return to;
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** R-AM-2: lowercase, no punctuation or digits, no stopwords or boilerplate, simple stems, sorted. */
export function normalizeQuestion(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/\(optional\)|\*/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return [...new Set(tokens)].sort().join(' ');
}

export function similarity(a: string, b: string): number {
  const x = new Set(a.split(' ').filter(Boolean));
  const y = new Set(b.split(' ').filter(Boolean));
  if (!x.size || !y.size) return 0;
  const shared = [...x].filter((t) => y.has(t)).length;
  return shared / (x.size + y.size - shared);
}

export const KIND_GROUP: Record<FieldKind, string> = {
  text: 'text',
  email: 'text',
  tel: 'text',
  url: 'text',
  number: 'text',
  date: 'text',
  textarea: 'long',
  contenteditable: 'long',
  select: 'choice',
  combobox: 'choice',
  'radio-group': 'choice',
  checkbox: 'checkbox',
  file: 'none',
  password: 'none',
  unknown: 'none',
};

export const MATCH_THRESHOLD = 0.6;

export interface MemoryMatch {
  entry: SavedAnswer;
  score: number;
  /** The answer as it should be entered in this field (snapped to an option for choices). */
  value: string;
}

/** R-AM-3: best saved answer for this field, if the words overlap enough and the kind fits. */
export function findMatch(field: Field, entries: readonly SavedAnswer[]): MemoryMatch | undefined {
  const key = normalizeQuestion(field.label);
  const group = KIND_GROUP[field.kind];
  if (!key || group === 'none') return undefined;
  let best: MemoryMatch | undefined;
  for (const entry of entries) {
    const entryGroup = KIND_GROUP[entry.fieldKind];
    const compatible = entryGroup === group || (group === 'long' && entryGroup === 'text') || (group === 'text' && entryGroup === 'long');
    if (!compatible) continue;
    const score = similarity(key, entry.normalizedKey);
    if (score < MATCH_THRESHOLD || (best && score <= best.score)) continue;
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

// ---- storage (IndexedDB `answers` store, keyed by normalizedKey) ---------------------------------

export function listAnswers(dbName?: string): Promise<SavedAnswer[]> {
  return withDb((db) => db.getAll('answers'), dbName);
}

/** Saves or replaces the answer for this question (R-AM-6: only when the user asked to remember it). */
export function saveAnswer(
  input: { questionText: string; answer: string; fieldKind: FieldKind; sensitive: boolean; embedding?: number[]; embeddingModel?: string },
  dbName?: string,
): Promise<void> {
  const normalizedKey = normalizeQuestion(input.questionText);
  if (!normalizedKey || !input.answer.trim()) return Promise.resolve();
  return withDb(async (db) => {
    const existing = await db.get('answers', normalizedKey);
    await db.put('answers', {
      normalizedKey,
      questionText: input.questionText.trim(),
      answer: input.answer.trim(),
      fieldKind: input.fieldKind,
      sensitive: input.sensitive,
      usedCount: existing?.usedCount ?? 0,
      lastUsed: Date.now(),
      embedding: input.embedding,
      embeddingModel: input.embedding ? input.embeddingModel : undefined,
    });
  }, dbName);
}

export function markUsed(normalizedKey: string, dbName?: string): Promise<void> {
  return withDb(async (db) => {
    const entry = await db.get('answers', normalizedKey);
    if (entry) await db.put('answers', { ...entry, usedCount: entry.usedCount + 1, lastUsed: Date.now() });
  }, dbName);
}

export function deleteAnswer(normalizedKey: string, dbName?: string): Promise<void> {
  return withDb((db) => db.delete('answers', normalizedKey), dbName);
}

export function updateAnswer(normalizedKey: string, answer: string, dbName?: string): Promise<void> {
  return withDb(async (db) => {
    const entry = await db.get('answers', normalizedKey);
    if (entry) await db.put('answers', { ...entry, answer: answer.trim() });
  }, dbName);
}

export function setEmbedding(normalizedKey: string, embedding: number[], embeddingModel: string, dbName?: string): Promise<void> {
  return withDb(async (db) => {
    const entry = await db.get('answers', normalizedKey);
    if (entry) await db.put('answers', { ...entry, embedding, embeddingModel });
  }, dbName);
}
