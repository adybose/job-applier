import { draftPrompt } from '../../prompts/draft';
import type { ChatMessage, ModelClient } from '../model/client';
import type { Profile } from '../profile/schema';
import type { Field } from '../snapshot';
import { charsFor, jobDescriptionText, profileText } from './context';
import type { Proposal } from './types';

// Spec 05 R-AL-10: stage 3.
export const DRAFT_OUTPUT_RESERVE = 1024;
export const DEFAULT_MAX_CHARS = 1200;

/** Which free-text fields get a draft: required ones, and cover-letter boxes. Optional "anything else?" boxes are skipped. */
export function shouldDraft(field: Field): boolean {
  return field.required || /cover letter|why (do )?you want|why .* interested/i.test(`${field.label} ${field.helpText ?? ''}`);
}

export function draftBudget(numCtx: number): { profileChars: number; jdChars: number } {
  const available = numCtx - DRAFT_OUTPUT_RESERVE;
  return { profileChars: charsFor(Math.floor(available * 0.4)), jdChars: charsFor(Math.floor(available * 0.4)) };
}

export function buildDraftMessages(field: Field, profile: Profile, jobDescription: string | undefined, numCtx: number): ChatMessage[] {
  const budget = draftBudget(numCtx);
  return draftPrompt.build({
    question: field.label,
    helpText: field.helpText,
    maxChars: field.constraints.maxLength ?? DEFAULT_MAX_CHARS,
    profile: profileText(profile, budget.profileChars),
    jobDescription: jobDescriptionText(jobDescription, budget.jdChars),
  });
}

/** Cleans model output: no wrapping quotes, markdown, headings or bullets. */
export function cleanDraft(text: string): string {
  return text
    .trim()
    .replace(/^["“']|["”']$/g, '')
    .replace(/^#+\s.*$/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cuts text to maxChars at a sentence boundary (AC-AL-10). Falls back to a word boundary. */
export function fitLength(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('.\n'));
  if (end > maxChars * 0.4) return cut.slice(0, end + 1).trim();
  if (/[.!?]$/.test(cut)) return cut;
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 0 ? space : maxChars - 1).trim()}…`.slice(0, maxChars);
}

/** Drops sentences that state a number found in neither the profile nor the job description. */
export function dropUngroundedNumbers(text: string, facts: string): { text: string; dropped: number } {
  const known = new Set(facts.match(/\d[\d,.]*/g)?.map((n) => n.replace(/[,.]$/, '').replace(/,/g, '')) ?? []);
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [text];
  let dropped = 0;
  const kept = sentences.filter((s) => {
    const numbers = s.match(/\d[\d,.]*/g)?.map((n) => n.replace(/[,.]$/, '').replace(/,/g, '')) ?? [];
    const ok = numbers.every((n) => known.has(n));
    if (!ok) dropped++;
    return ok;
  });
  return { text: kept.join('').trim(), dropped };
}

export async function draftAnswer(
  client: ModelClient,
  field: Field,
  profile: Profile,
  jobDescription: string | undefined,
  numCtx: number,
): Promise<Proposal | undefined> {
  const reply = await client.chat({
    slot: 'drafting',
    stage: 'drafting',
    promptId: draftPrompt.id,
    promptVersion: draftPrompt.version,
    messages: buildDraftMessages(field, profile, jobDescription, numCtx),
    temperature: 0.6,
  });
  const facts = `${profileText(profile, Number.MAX_SAFE_INTEGER)}\n${jobDescription ?? ''}`;
  const grounded = dropUngroundedNumbers(cleanDraft(reply.content), facts);
  const value = fitLength(grounded.text, field.constraints.maxLength ?? DEFAULT_MAX_CHARS);
  if (!value) return undefined;
  return {
    fieldId: field.id,
    action: 'fill',
    value,
    confidence: 0.8,
    rationale:
      grounded.dropped > 0
        ? `Drafted from your profile and the job description. Removed ${grounded.dropped} sentence${grounded.dropped === 1 ? '' : 's'} with numbers not in your profile.`
        : 'Drafted from your profile and the job description.',
    sensitive: false,
    origin: 'draft',
  };
}
