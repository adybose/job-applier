import { z } from 'zod';

// Spec 04 R-AC-1/R-AC-2: the complete action vocabulary. Anything else is rejected.
export const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('fill'), fieldId: z.string(), value: z.string(), overwrite: z.boolean().default(false) }),
  z.object({
    action: z.literal('select_option'),
    fieldId: z.string(),
    value: z.string(),
    overwrite: z.boolean().default(false),
  }),
  z.object({ action: z.literal('set_checked'), fieldId: z.string(), checked: z.boolean() }),
  z.object({
    action: z.literal('upload_file'),
    fieldId: z.string(),
    fileKind: z.literal('resume'),
    file: z.object({ name: z.string(), type: z.string(), base64: z.string() }),
  }),
  z.object({ action: z.literal('click'), buttonId: z.string(), approvedNav: z.literal(true) }),
  z.object({ action: z.literal('scroll_to'), fieldId: z.string() }),
  z.object({
    action: z.literal('highlight'),
    fieldId: z.string(),
    style: z.enum(['handoff', 'submit', 'focus']),
    note: z.string().optional(),
  }),
  z.object({ action: z.literal('clear_highlight'), fieldId: z.string().optional() }),
  z.object({ action: z.literal('clear'), fieldId: z.string(), overwrite: z.boolean().default(false) }),
]);
export type Action = z.input<typeof ActionSchema>;
export type ParsedAction = z.output<typeof ActionSchema>;

export type ActionFailure =
  | 'not-found'
  | 'not-allowed'
  | 'needs-approval'
  | 'no-matching-option'
  | 'did-not-stick'
  | 'invalid';

export type ActionResult = { ok: true; value: string } | { ok: false; reason: ActionFailure; detail?: string };
