import { z } from 'zod';
import { browser } from 'wxt/browser';
import { isLoopbackUrl, LOOPBACK_ERROR } from './loopback';
import { DEFAULT_PRESET } from './presets';

const STORAGE_KEY = 'settings.model.v1';

export const SlotConfigSchema = z.object({
  model: z.string().trim().min(1, 'Choose a model.'),
  numCtx: z.number().int().min(2048).max(131072),
});
export type SlotConfig = z.infer<typeof SlotConfigSchema>;

export const ModelSettingsSchema = z.object({
  endpoint: z.string().refine(isLoopbackUrl, LOOPBACK_ERROR),
  apiStyle: z.enum(['ollama', 'openai']),
  sameModelForBoth: z.boolean(),
  mapping: SlotConfigSchema,
  drafting: SlotConfigSchema,
  timeoutMs: z.number().int().positive(),
});
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;

export type SlotName = 'mapping' | 'drafting';

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  endpoint: 'http://localhost:11434',
  apiStyle: 'ollama',
  sameModelForBoth: true,
  mapping: { model: DEFAULT_PRESET.model, numCtx: DEFAULT_PRESET.numCtx },
  drafting: { model: DEFAULT_PRESET.model, numCtx: DEFAULT_PRESET.numCtx },
  timeoutMs: 120_000,
};

export function resolveSlot(settings: ModelSettings, slot: SlotName): SlotConfig {
  return slot === 'drafting' && !settings.sameModelForBoth ? settings.drafting : settings.mapping;
}

export async function loadModelSettings(): Promise<ModelSettings> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const parsed = ModelSettingsSchema.safeParse(stored[STORAGE_KEY]);
  return parsed.success ? parsed.data : DEFAULT_MODEL_SETTINGS;
}

export async function saveModelSettings(
  settings: ModelSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ModelSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'These settings are not valid.' };
  }
  await browser.storage.local.set({ [STORAGE_KEY]: parsed.data });
  return { ok: true };
}
