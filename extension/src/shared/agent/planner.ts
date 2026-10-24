import { z } from 'zod';
import { planPrompt } from '../../prompts/plan';
import type { ChatMessage, ModelClient } from '../model/client';
import { estimateTokens } from '../model/tokens';
import { bestOption } from '../policy/options';
import { jsonSchemaFor } from '../profile/extract';
import type { Profile } from '../profile/schema';
import type { Field } from '../snapshot';
import { charsFor, jobDescriptionText, profileText } from './context';
import type { Proposal } from './types';

// Spec 05 R-AL-5..R-AL-9: stage 2.

export const PlanSchema = z.object({
  actions: z.array(
    z.object({
      field_id: z.string(),
      /** Empty, or skip: true, when the profile does not answer the field. The action comes from the field kind. */
      value: z.string(),
      skip: z.boolean(),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
      sensitive: z.boolean(),
    }),
  ),
});
export type Plan = z.infer<typeof PlanSchema>;
const PLAN_JSON_SCHEMA = jsonSchemaFor(PlanSchema);

export const OUTPUT_RESERVE = 2048;
const INSTRUCTION_TOKENS = 600;
const MAX_BATCH = 15;
const MAX_OPTIONS = 40;

/** Stage 3 handles long free text; everything else that the mapper missed comes here. */
export function isFreeText(field: Field): boolean {
  return field.kind === 'textarea' || field.kind === 'contenteditable';
}

export function fieldLine(f: Field): string {
  const details: string[] = [];
  if (f.required) details.push('required');
  if (f.section) details.push(`section: ${f.section}`);
  if (f.helpText) details.push(`help: ${f.helpText}`);
  if (f.constraints.maxLength) details.push(`max ${f.constraints.maxLength} chars`);
  if (f.options?.length) {
    const opts = f.options.slice(0, MAX_OPTIONS).map((o) => o.label);
    details.push(`options: ${opts.join(' / ')}${f.options.length > MAX_OPTIONS ? ' / …' : ''}`);
  }
  return `${f.id} | ${f.kind} | ${f.label}${details.length ? ` | ${details.join('; ')}` : ''}`;
}

const VALID_ACTIONS: Record<Field['kind'], readonly string[]> = {
  text: ['fill'],
  email: ['fill'],
  tel: ['fill'],
  url: ['fill'],
  number: ['fill'],
  date: ['fill'],
  textarea: ['fill'],
  contenteditable: ['fill'],
  select: ['select_option'],
  combobox: ['select_option'],
  'radio-group': ['select_option'],
  checkbox: ['set_checked'],
  file: [],
  password: [],
  unknown: [],
};

/** Values the model wrote that are not in the profile were inferred, so they never auto-fill (ADR-011). */
export const INFERRED_CAP = 0.7;

const STOP = new Set(
  'have with your about would which there their where what when does this that from will been were they them then than into over under also only just more most other please describe current highest level years year valid able like company website'.split(
    ' ',
  ),
);
const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}+#.]{4,}/gu) ?? [];

/** A typed value counts as stated when it appears in the profile as a whole word or phrase. */
export function statedInProfile(value: string, facts: string): boolean {
  const escaped = value.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(facts.toLowerCase());
}

/** A choice is grounded when the question or the chosen option shares a meaningful word with the profile. */
export function groundedChoice(label: string, option: string, facts: string): boolean {
  const factWords = new Set(words(facts));
  return [...words(label), ...words(option)].some((w) => !STOP.has(w) && factWords.has(w));
}

export interface Discarded {
  fieldId: string;
  reason: string;
}

/** R-AL-8: keep only plan items that make sense for the field. Everything else is discarded in code. */
export function validatePlan(
  plan: Plan,
  fields: readonly Field[],
  profileFacts = '',
): { proposals: Proposal[]; discarded: Discarded[] } {
  const facts = profileFacts.toLowerCase();
  const byId = new Map(fields.map((f) => [f.id, f]));
  const proposals: Proposal[] = [];
  const discarded: Discarded[] = [];
  const seen = new Set<string>();

  for (const item of plan.actions) {
    const field = byId.get(item.field_id);
    if (!field) {
      discarded.push({ fieldId: item.field_id, reason: 'unknown field' });
      continue;
    }
    if (seen.has(field.id)) continue;
    seen.add(field.id);

    const base = {
      fieldId: field.id,
      confidence: item.confidence,
      rationale: item.rationale.slice(0, 200),
      sensitive: item.sensitive,
      origin: 'model' as const,
    };
    const action = VALID_ACTIONS[field.kind][0] as Proposal['action'] | undefined;
    if (item.skip || !item.value.trim()) {
      proposals.push({ ...base, action: 'skip', value: '', confidence: 0 });
      continue;
    }
    if (!action) {
      discarded.push({ fieldId: field.id, reason: `a ${field.kind} cannot be filled by the model` });
      continue;
    }
    let value = item.value.trim();
    if (action === 'select_option' && field.options?.length) {
      const match = bestOption(field.options, value);
      if (!match) {
        discarded.push({ fieldId: field.id, reason: `"${value}" is not one of the options` });
        continue;
      }
      value = match.label;
    }
    if (action === 'set_checked') {
      if (!/^(true|false|yes|no)$/i.test(value)) {
        discarded.push({ fieldId: field.id, reason: 'checkbox value must be true or false' });
        continue;
      }
      value = /^(true|yes)$/i.test(value) ? 'true' : 'false';
    }
    let confidence = base.confidence;
    let rationale = base.rationale;
    const grounded =
      !facts ||
      (action === 'fill' ? statedInProfile(value, facts) : groundedChoice(field.label, value, facts));
    if (!grounded) {
      confidence = Math.min(confidence, INFERRED_CAP);
      rationale = `${rationale} (inferred, not in your profile)`.trim();
    }
    proposals.push({ ...base, confidence, rationale, action, value });
  }
  return { proposals, discarded };
}

export interface PlanBudget {
  profileChars: number;
  jdChars: number;
  fieldChars: number;
}

/** Spec 07 R-MR-10: 35% profile, 25% job description, the rest for instructions and fields. */
export function planBudget(numCtx: number): PlanBudget {
  const available = numCtx - OUTPUT_RESERVE;
  const profileTokens = Math.floor(available * 0.35);
  const jdTokens = Math.floor(available * 0.25);
  return {
    profileChars: charsFor(profileTokens),
    jdChars: charsFor(jdTokens),
    fieldChars: charsFor(available - profileTokens - jdTokens - INSTRUCTION_TOKENS),
  };
}

/** Splits fields into batches of at most 15 that fit the field budget (R-AL-9). */
export function batchFields(fields: readonly Field[], maxChars: number): Field[][] {
  const batches: Field[][] = [];
  let current: Field[] = [];
  let size = 0;
  for (const f of fields) {
    const len = fieldLine(f).length + 1;
    if (current.length && (current.length >= MAX_BATCH || size + len > maxChars)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += len;
  }
  if (current.length) batches.push(current);
  return batches;
}

export function buildPlanMessages(fields: readonly Field[], profile: Profile, jobDescription: string | undefined, numCtx: number): ChatMessage[] {
  const budget = planBudget(numCtx);
  return planPrompt.build({
    profile: profileText(profile, budget.profileChars),
    jobDescription: jobDescriptionText(jobDescription, budget.jdChars),
    fields: fields.map(fieldLine).join('\n').slice(0, budget.fieldChars),
  });
}

export function promptTokens(messages: readonly ChatMessage[]): number {
  return messages.reduce((n, m) => n + estimateTokens(m.content), 0);
}

export interface PlanResult {
  proposals: Proposal[];
  discarded: Discarded[];
  /** Fields whose batch failed twice; the policy turns required ones into questions (R-AL-7). */
  failed: string[];
}

/** Stage 2 for the given fields. Never throws: model trouble turns into failed fields. */
export async function planFields(
  client: ModelClient,
  fields: readonly Field[],
  profile: Profile,
  jobDescription: string | undefined,
  numCtx: number,
): Promise<PlanResult> {
  const result: PlanResult = { proposals: [], discarded: [], failed: [] };
  const todo = fields.filter((f) => !isFreeText(f) && VALID_ACTIONS[f.kind].length > 0);

  for (const batch of batchFields(todo, planBudget(numCtx).fieldChars)) {
    const messages = buildPlanMessages(batch, profile, jobDescription, numCtx);
    let plan: Plan | undefined;
    for (let attempt = 0; attempt < 2 && !plan; attempt++) {
      try {
        const reply = await client.chat({
          slot: 'mapping',
          stage: 'planning',
          promptId: planPrompt.id,
          promptVersion: planPrompt.version,
          messages,
          schema: PLAN_JSON_SCHEMA,
          temperature: 0.2,
        });
        const parsed = (() => {
          try {
            return PlanSchema.safeParse(JSON.parse(reply.content));
          } catch {
            return { success: false as const, error: new z.ZodError([]) };
          }
        })();
        if (parsed.success) {
          plan = parsed.data;
        } else {
          const why = parsed.error.issues.length ? z.prettifyError(parsed.error) : 'The reply was not valid JSON.';
          messages.push(
            { role: 'assistant', content: reply.content },
            { role: 'user', content: `That reply did not match the schema:\n${why}\nReply again with only valid JSON.` },
          );
        }
      } catch {
        break;
      }
    }
    if (!plan) {
      result.failed.push(...batch.map((f) => f.id));
      continue;
    }
    const { proposals, discarded } = validatePlan(plan, batch, profileText(profile, Number.MAX_SAFE_INTEGER));
    result.proposals.push(...proposals);
    result.discarded.push(...discarded);
  }
  return result;
}
