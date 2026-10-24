// Spec 07 R-MR-5. Built-in presets for a 16 GB Apple Silicon laptop.
export interface ModelPreset {
  id: 'fast' | 'quality';
  label: string;
  model: string;
  numCtx: number;
  note: string;
}

export const PRESETS: readonly ModelPreset[] = [
  {
    id: 'fast',
    label: 'Fast (Gemma 3 4B)',
    model: 'gemma3:4b-it-qat',
    numCtx: 16384,
    note: 'Light and quick. Recommended.',
  },
  {
    id: 'quality',
    label: 'Quality (Gemma 3 12B)',
    model: 'gemma3:12b-it-qat',
    numCtx: 8192,
    note: 'Better answers, slower. Needs about 9 GB of free memory.',
  },
];

export const DEFAULT_PRESET = PRESETS[0] as ModelPreset;

export function presetFor(model: string): ModelPreset | undefined {
  return PRESETS.find((p) => p.model === model);
}

export function pullCommand(model: string): string {
  return `ollama pull ${model}`;
}
