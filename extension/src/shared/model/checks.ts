import { ModelClient, ModelError } from './client';
import { PRESETS, pullCommand, type ModelPreset } from './presets';
import { type ModelSettings, type SlotName } from './settings';

export interface ModelOption {
  model: string;
  label: string;
  installed: boolean;
  preset: ModelPreset['id'] | undefined;
  note?: string;
  pullCommand: string;
}

function isInstalled(model: string, installed: readonly string[]): boolean {
  const bare = (name: string) => name.replace(/:latest$/, '');
  return installed.some((name) => name === model || bare(name) === bare(model));
}

/** Spec 07 R-MR-7: presets first (greyed out when missing), then every other installed model. */
export function modelOptions(installed: readonly string[]): ModelOption[] {
  const presets = PRESETS.map((p) => ({
    model: p.model,
    label: p.label,
    installed: isInstalled(p.model, installed),
    preset: p.id,
    note: p.note,
    pullCommand: pullCommand(p.model),
  }));
  const others = installed
    // Embedding models can't chat; they are used for answer memory instead.
    .filter((name) => !/embed/i.test(name))
    .filter((name) => !PRESETS.some((p) => isInstalled(p.model, [name])))
    .map((name) => ({ model: name, label: name, installed: true, preset: undefined, pullCommand: pullCommand(name) }));
  return [...presets, ...others];
}

export interface CheckReport {
  reachable: 'ok' | 'fail';
  cors: 'ok' | 'fail' | 'unknown';
  models: { slot: SlotName; model: string; installed: boolean }[];
  error?: string;
  allPassed: boolean;
}

function selectedModels(settings: ModelSettings): { slot: SlotName; model: string }[] {
  const mapping = { slot: 'mapping' as const, model: settings.mapping.model };
  if (settings.sameModelForBoth || settings.drafting.model === settings.mapping.model) return [mapping];
  return [mapping, { slot: 'drafting', model: settings.drafting.model }];
}

/** Spec 07 R-MR-14: reachable, then CORS, then each selected model pulled. */
export async function runChecks(client: ModelClient, settings: ModelSettings): Promise<CheckReport> {
  try {
    await client.version();
  } catch (err) {
    const forbidden = err instanceof ModelError && err.kind === 'forbidden';
    return {
      reachable: forbidden ? 'ok' : 'fail',
      cors: forbidden ? 'fail' : 'unknown',
      models: [],
      error: err instanceof Error ? err.message : String(err),
      allPassed: false,
    };
  }

  const installed = await client.listModels();
  const models = selectedModels(settings).map((m) => ({ ...m, installed: isInstalled(m.model, installed) }));
  return { reachable: 'ok', cors: 'ok', models, allPassed: models.every((m) => m.installed) };
}

export interface BenchmarkResult {
  model: string;
  tokensPerSecond: number | undefined;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

const BENCHMARK_PROMPT = 'In two sentences, explain why software that runs on your own computer can protect your privacy.';

/** Spec 07 R-MR-15: one short prompt per selected model. */
export async function benchmark(client: ModelClient, settings: ModelSettings): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  for (const { slot, model } of selectedModels(settings)) {
    try {
      const r = await client.chat({
        slot,
        stage: 'benchmark',
        promptId: 'benchmark',
        promptVersion: 1,
        messages: [{ role: 'user', content: BENCHMARK_PROMPT }],
        temperature: 0.2,
      });
      results.push({ model, tokensPerSecond: r.tokensPerSecond, latencyMs: r.latencyMs, ok: true });
    } catch (err) {
      results.push({ model, tokensPerSecond: undefined, latencyMs: 0, ok: false, error: String(err) });
    }
  }
  return results;
}

export type OS = 'mac' | 'linux' | 'win';

export function detectOS(platform: string): OS {
  const p = platform.toLowerCase();
  if (p.includes('win')) return 'win';
  if (p.includes('mac')) return 'mac';
  return 'linux';
}

export interface InstructionStep {
  text: string;
  command?: string;
}

/** Spec 07 R-MR-14 step 2: how to allow the extension origin in Ollama. */
export function corsInstructions(os: OS): InstructionStep[] {
  switch (os) {
    case 'mac':
      return [
        { text: 'Run this in Terminal:', command: 'launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"' },
        { text: 'Then quit Ollama from the menu bar and open it again.' },
      ];
    case 'linux':
      return [
        { text: 'Open the Ollama service settings:', command: 'sudo systemctl edit ollama.service' },
        { text: 'Add this line under [Service]:', command: 'Environment="OLLAMA_ORIGINS=chrome-extension://*"' },
        { text: 'Then restart Ollama:', command: 'sudo systemctl daemon-reload && sudo systemctl restart ollama' },
      ];
    case 'win':
      return [
        { text: 'Open Settings → System → About → Advanced system settings → Environment Variables.' },
        { text: 'Add a user variable named OLLAMA_ORIGINS with this value:', command: 'chrome-extension://*' },
        { text: 'Then quit Ollama from the system tray and open it again.' },
      ];
  }
}
