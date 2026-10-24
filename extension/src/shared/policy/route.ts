import type { Proposal } from '../agent/types';
import type { Field } from '../snapshot';
import { DEMOGRAPHIC, sensitiveCategory, type SensitiveCategory } from './sensitive';

// Spec 05 R-AL-11: routing is decided here, in code. Model output can only lower trust, never raise it.
export type Route = 'auto' | 'approval' | 'question' | 'handoff' | 'skip';

export const AUTO_CONFIDENCE = 0.85;

export interface RouteContext {
  /** Fields whose action already failed verification (spec 04 R-AC-9). */
  failed: ReadonlySet<string>;
  /** Values this run already wrote, so re-filling them is not an overwrite. */
  written: ReadonlyMap<string, string>;
}

export interface RouteDecision {
  route: Route;
  reason: string;
  category?: SensitiveCategory;
}

const RESUME = /\b(resume|résumé|cv|curriculum vitae)\b/i;
const HUMAN_ONLY = /\b(e-?sign(ature)?|signature|sign here|assessment|coding (test|challenge)|quiz|skills test|record (a |your )?(video|audio|answer)|video (answer|response|introduction))\b/i;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const isEmpty = (field: Field) => !field.value.trim() || (field.kind === 'checkbox' && field.value === 'false');

export function isResumeField(field: Field): boolean {
  return field.kind === 'file' && (RESUME.test(field.label) || RESUME.test(field.name ?? ''));
}

/** What the human is asked to do for a handoff, in one plain sentence (spec 06 R-HL-6). */
export function handoffInstruction(field: Field): string {
  if (field.kind === 'password') return 'Sign in or create the account yourself, then come back.';
  if (field.kind === 'file') return `Upload your ${field.label.replace(/\s*\(.*?\)\s*/g, ' ').trim().toLowerCase() || 'file'} here.`;
  if (HUMAN_ONLY.test(field.label)) return `Please do this step yourself: ${field.label}.`;
  return `Please fill in "${field.label}" yourself.`;
}

export function route(field: Field, proposal: Proposal | undefined, ctx: RouteContext): RouteDecision {
  const category = sensitiveCategory(field);

  // Human handoffs: things the agent cannot or must not do.
  if (field.kind === 'password') return { route: 'handoff', reason: 'Passwords are never typed by Lazy Apply.', category };
  if (ctx.failed.has(field.id)) return { route: 'handoff', reason: 'Lazy Apply could not set this field.', category };
  if (HUMAN_ONLY.test(field.label)) return { route: 'handoff', reason: 'This step needs you.', category };
  if (field.kind === 'file') {
    if (!isResumeField(field)) return { route: 'handoff', reason: 'Only your CV is uploaded automatically.', category };
    if (!proposal || proposal.action !== 'upload_file') return { route: 'handoff', reason: 'No CV saved in your profile.', category };
    if (proposal.usesLinkedinPdf) return { route: 'approval', reason: 'Use your LinkedIn PDF as your resume?', category };
    return { route: 'auto', reason: 'Your CV.', category };
  }

  // Nothing to propose.
  if (!proposal || proposal.action === 'skip' || proposal.action === 'ask' || (!proposal.value.trim() && proposal.action !== 'set_checked')) {
    if (proposal?.action === 'ask') return { route: 'question', reason: proposal.rationale, category };
    return field.required
      ? { route: 'question', reason: 'Required, and your profile has no answer.', category }
      : { route: 'skip', reason: 'Optional, and your profile has no answer.', category };
  }

  // Approval: judgment, sensitivity, low confidence, drafted text, or overwriting.
  if (category) {
    return {
      route: 'approval',
      reason: DEMOGRAPHIC.has(category) ? 'Demographic questions always need your OK.' : 'Sensitive question.',
      category,
    };
  }
  if (proposal.sensitive) return { route: 'approval', reason: 'The model flagged this as sensitive.', category };
  if (proposal.origin === 'draft') return { route: 'approval', reason: 'Written answer: please review.', category };
  // Spec 09 AC-AM-3: an essay saved for one company is reviewed before it goes to another.
  if (proposal.origin === 'memory' && (field.kind === 'textarea' || field.kind === 'contenteditable')) {
    return { route: 'approval', reason: 'Your saved answer from another application: please review.', category };
  }
  if (!isEmpty(field) && !same(field.value, proposal.value) && !same(ctx.written.get(field.id) ?? '', field.value)) {
    return { route: 'approval', reason: 'This would replace what is already there.', category };
  }
  if (proposal.origin === 'mapper' || proposal.origin === 'user') return { route: 'auto', reason: 'From your profile.', category };
  if (proposal.confidence >= AUTO_CONFIDENCE) return { route: 'auto', reason: 'High confidence.', category };
  return { route: 'approval', reason: 'Not sure about this one.', category };
}
