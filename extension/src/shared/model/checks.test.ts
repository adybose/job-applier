import { describe, expect, it } from 'vitest';
import { ModelClient } from './client';
import { benchmark, corsInstructions, detectOS, modelOptions, runChecks } from './checks';
import { DEFAULT_MODEL_SETTINGS, type ModelSettings } from './settings';
import { MemoryStatsSink } from './stats';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function clientWith(settings: ModelSettings, respond: (url: string) => Response) {
  const fetchFn = (async (input: RequestInfo | URL) => respond(String(input))) as typeof fetch;
  let t = 0;
  return new ModelClient(settings, { fetch: fetchFn, now: () => (t += 1000), stats: new MemoryStatsSink() });
}

describe('modelOptions', () => {
  // AC-MR-4
  it('greys out presets that are not installed and shows the pull command', () => {
    const options = modelOptions(['gemma3:4b-it-qat', 'qwen3:4b']);
    expect(options).toEqual([
      expect.objectContaining({ model: 'gemma3:4b-it-qat', installed: true, preset: 'fast' }),
      expect.objectContaining({
        model: 'gemma3:12b-it-qat',
        installed: false,
        preset: 'quality',
        pullCommand: 'ollama pull gemma3:12b-it-qat',
      }),
      expect.objectContaining({ model: 'qwen3:4b', installed: true, preset: undefined }),
    ]);
  });

  it('leaves embedding models out of the chat model list', () => {
    expect(modelOptions(['embeddinggemma:latest', 'nomic-embed-text:latest']).map((o) => o.model)).toEqual([
      'gemma3:4b-it-qat',
      'gemma3:12b-it-qat',
    ]);
  });

  it('treats name:latest as installed for a bare name', () => {
    expect(modelOptions(['mymodel:latest']).find((o) => o.model === 'mymodel:latest')?.installed).toBe(true);
  });
});

describe('runChecks', () => {
  it('passes when Ollama is reachable and the model is pulled', async () => {
    const client = clientWith(DEFAULT_MODEL_SETTINGS, (url) =>
      url.endsWith('/api/version') ? json({ version: '0.12.0' }) : json({ models: [{ name: 'gemma3:4b-it-qat' }] }),
    );
    const report = await runChecks(client, DEFAULT_MODEL_SETTINGS);
    expect(report).toMatchObject({ reachable: 'ok', cors: 'ok', allPassed: true });
    expect(report.models).toEqual([{ slot: 'mapping', model: 'gemma3:4b-it-qat', installed: true }]);
  });

  // AC-MR-5
  it('reports CORS when Ollama answers 403', async () => {
    const client = clientWith(DEFAULT_MODEL_SETTINGS, () => new Response('', { status: 403 }));
    const report = await runChecks(client, DEFAULT_MODEL_SETTINGS);
    expect(report).toMatchObject({ reachable: 'ok', cors: 'fail', allPassed: false });
  });

  it('reports unreachable when nothing listens', async () => {
    const fetchFn = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const client = new ModelClient(DEFAULT_MODEL_SETTINGS, { fetch: fetchFn, now: () => 0, stats: new MemoryStatsSink() });
    const report = await runChecks(client, DEFAULT_MODEL_SETTINGS);
    expect(report).toMatchObject({ reachable: 'fail', cors: 'unknown', allPassed: false });
  });

  it('checks both slots when they use different models', async () => {
    const settings: ModelSettings = {
      ...DEFAULT_MODEL_SETTINGS,
      sameModelForBoth: false,
      drafting: { model: 'gemma3:12b-it-qat', numCtx: 8192 },
    };
    const client = clientWith(settings, (url) =>
      url.endsWith('/api/version') ? json({ version: '0.12.0' }) : json({ models: [{ name: 'gemma3:4b-it-qat' }] }),
    );
    const report = await runChecks(client, settings);
    expect(report.models).toEqual([
      { slot: 'mapping', model: 'gemma3:4b-it-qat', installed: true },
      { slot: 'drafting', model: 'gemma3:12b-it-qat', installed: false },
    ]);
    expect(report.allPassed).toBe(false);
  });
});

describe('corsInstructions', () => {
  const flat = (os: 'mac' | 'linux' | 'win') =>
    corsInstructions(os)
      .map((s) => `${s.text}\n${s.command ?? ''}`)
      .join('\n');

  it('gives launchctl steps on macOS', () => {
    expect(flat('mac')).toContain('launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"');
  });
  it('gives systemd steps on Linux', () => {
    expect(flat('linux')).toContain('systemctl edit ollama.service');
  });
  it('gives environment variable steps on Windows', () => {
    expect(flat('win')).toContain('OLLAMA_ORIGINS');
  });
  it('detects the OS from the platform string', () => {
    expect(detectOS('MacIntel')).toBe('mac');
    expect(detectOS('Win32')).toBe('win');
    expect(detectOS('Linux x86_64')).toBe('linux');
  });
});

describe('benchmark', () => {
  it('runs once per distinct model and reports tokens per second', async () => {
    const client = clientWith(DEFAULT_MODEL_SETTINGS, () =>
      json({ message: { content: 'ok' }, eval_count: 40, eval_duration: 1_000_000_000, prompt_eval_count: 10 }),
    );
    const results = await benchmark(client, DEFAULT_MODEL_SETTINGS);
    expect(results).toEqual([{ model: 'gemma3:4b-it-qat', tokensPerSecond: 40, latencyMs: 1000, ok: true }]);
  });
});
