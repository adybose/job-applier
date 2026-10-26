import type { Option } from '../snapshot';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Common short forms of country names, as CVs write them, to the names option lists use. */
const ALIASES: Record<string, string> = {
  usa: 'united states',
  us: 'united states',
  'u s': 'united states',
  'u s a': 'united states',
  'united states of america': 'united states',
  uk: 'united kingdom',
  'u k': 'united kingdom',
  'great britain': 'united kingdom',
  uae: 'united arab emirates',
};

const tokens = (s: string) => new Set(norm(s).split(' ').filter((t) => t.length > 1));

/**
 * Picks the option that best matches a proposed value: exact (label or value), then prefix,
 * then contains, then word overlap of at least 0.5. Returns undefined when nothing is close.
 */
export function bestOption(options: readonly Option[], proposed: string): Option | undefined {
  const raw = norm(proposed);
  if (!raw) return undefined;
  const p = ALIASES[raw] ?? raw;
  const exact = options.find((o) => [raw, p].includes(norm(o.label)) || [raw, p].includes(norm(o.value)));
  if (exact) return exact;
  const prefix = options.filter((o) => norm(o.label).startsWith(p) || p.startsWith(norm(o.label)));
  if (prefix.length === 1) return prefix[0];
  const contains = options.filter((o) => norm(o.label).includes(p));
  if (contains.length === 1) return contains[0];

  const want = tokens(p);
  let best: Option | undefined;
  let bestScore = 0;
  for (const o of options) {
    const have = tokens(o.label);
    const shared = [...want].filter((t) => have.has(t)).length;
    const score = shared / Math.max(want.size, have.size, 1);
    if (score > bestScore) {
      best = o;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : prefix[0] ?? contains[0];
}

/** The "decline to answer" option of an EEO question, if it has one (spec 05 R-AL-13). */
export function declineOption(options: readonly Option[]): Option | undefined {
  return options.find((o) =>
    /decline|prefer not|don.?t wish|do not wish|not (want|wish) to (answer|say|disclose)|rather not/i.test(o.label),
  );
}
