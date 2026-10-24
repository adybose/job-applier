import { z } from 'zod';

// Spec 03 R-PP-1..R-PP-3, R-PP-13. Produced by the content script in every frame.
export const FieldKindSchema = z.enum([
  'text',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'textarea',
  'select',
  'combobox',
  'radio-group',
  'checkbox',
  'file',
  'contenteditable',
  'password',
  'unknown',
]);
export type FieldKind = z.infer<typeof FieldKindSchema>;

export const OptionSchema = z.object({ value: z.string(), label: z.string() });
export type Option = z.infer<typeof OptionSchema>;

export const FieldSchema = z.object({
  id: z.string(),
  frameId: z.number().default(0),
  kind: FieldKindSchema,
  /** How the control is operated, for the action layer. */
  widget: z.enum(['native', 'react-select', 'aria-combobox', 'toggle-buttons']).default('native'),
  label: z.string(),
  helpText: z.string().optional(),
  required: z.boolean(),
  options: z.array(OptionSchema).optional(),
  value: z.string(),
  constraints: z
    .object({
      maxLength: z.number().optional(),
      pattern: z.string().optional(),
      accept: z.string().optional(),
      min: z.string().optional(),
      max: z.string().optional(),
    })
    .default({}),
  section: z.string().optional(),
  autocomplete: z.string().optional(),
  name: z.string().optional(),
});
export type Field = z.infer<typeof FieldSchema>;

export const ButtonSchema = z.object({
  id: z.string(),
  frameId: z.number().default(0),
  text: z.string(),
  type: z.string(),
  ariaLabel: z.string().optional(),
  isSubmitLike: z.boolean(),
  isNavLike: z.boolean(),
});
export type Button = z.infer<typeof ButtonSchema>;

export const BlockerSchema = z.object({
  id: z.string(),
  frameId: z.number().default(0),
  type: z.enum(['captcha', 'login', 'recorder', 'oauth']),
  description: z.string(),
});
export type Blocker = z.infer<typeof BlockerSchema>;

export const FormSnapshotSchema = z.object({
  frameId: z.number().default(0),
  url: z.string(),
  title: z.string(),
  stepHint: z.string().optional(),
  jobDescription: z.string().optional(),
  fields: z.array(FieldSchema),
  buttons: z.array(ButtonSchema),
  blockers: z.array(BlockerSchema),
});
export type FormSnapshot = z.infer<typeof FormSnapshotSchema>;

/** Merges per-frame snapshots (R-PP-8). The top frame supplies url/title; the longest job description wins. */
export function mergeSnapshots(frames: readonly FormSnapshot[]): FormSnapshot {
  const top = frames.find((f) => f.frameId === 0) ?? frames[0];
  if (!top) return { frameId: 0, url: '', title: '', fields: [], buttons: [], blockers: [] };
  const tag = <T extends { frameId: number }>(items: T[], frameId: number) => items.map((i) => ({ ...i, frameId }));
  const jobDescription = frames
    .map((f) => f.jobDescription ?? '')
    .reduce((a, b) => (b.length > a.length ? b : a), '');
  return {
    frameId: 0,
    url: top.url,
    title: top.title,
    stepHint: frames.find((f) => f.stepHint)?.stepHint,
    jobDescription: jobDescription || undefined,
    fields: frames.flatMap((f) => tag(f.fields, f.frameId)),
    buttons: frames.flatMap((f) => tag(f.buttons, f.frameId)),
    blockers: frames.flatMap((f) => tag(f.blockers, f.frameId)),
  };
}
