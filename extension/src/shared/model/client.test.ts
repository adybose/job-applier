import { describe, expect, it } from 'vitest';
import { ModelClient, ModelError } from './client';
import { DEFAULT_MODEL_SETTINGS, type ModelSettings } from './settings';
import { MemoryStatsSink } from './stats';

interface Recorded {
  url: string;
  init: RequestInit | undefined;
  body: Record<string, unknown> | undefined;
}

function fakeFetch(respond: (url: string, body: Record<string, unknown> | undefined) => Response) {
  const calls: Recorded[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url, init, body });
    return respond(url, body);
  };
  return { calls, fetchFn: fetchFn as typeof fetch };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const ollamaReply = (content: string) =>
  json({
    model: 'gemma3:4b-it-qat',
    message: { role: 'assistant', content },
    done: true,
    prompt_eval_count: 120,
    eval_count: 50,
    eval_duration: 2_000_000_000,
  });

const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };

function makeClient(settings: ModelSettings, fetchFn: typeof fetch, stats = new MemoryStatsSink()) {
  let t = 1000;
  return { client: new ModelClient(settings, { fetch: fetchFn, now: () => (t += 250), stats }), stats };
}

describe('ModelClient (Ollama native)', () => {
  // AC-MR-1
  it('sends format, num_ctx, temperature and stream:false on every call', async () => {
    const { calls, fetchFn } = fakeFetch(() => ollamaReply('{"ok":true}'));
    const { client } = makeClient(DEFAULT_MODEL_SETTINGS, fetchFn);

    const result = await client.chat({
      slot: 'mapping',
      stage: 'planning',
      promptId: 'plan',
      promptVersion: 1,
      messages: [{ role: 'user', content: 'hi' }],
      schema,
      temperature: 0.2,
    });

    expect(calls[0]?.url).toBe('http://localhost:11434/api/chat');
    expect(calls[0]?.body).toMatchObject({
      model: 'gemma3:4b-it-qat',
      stream: false,
      format: schema,
      options: { num_ctx: 16384, temperature: 0.2 },
    });
    expect(result.content).toBe('{"ok":true}');
    expect(result.inputTokens).toBe(120);
    expect(result.outputTokens).toBe(50);
  });

  // AC-MR-9
  it('computes tokens per second from eval_count and eval_duration', async () => {
    const { fetchFn } = fakeFetch(() => ollamaReply('hello'));
    const { client } = makeClient(DEFAULT_MODEL_SETTINGS, fetchFn);
    const result = await client.chat({
      slot: 'mapping',
      stage: 'benchmark',
      promptId: 'bench',
      promptVersion: 1,
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.2,
    });
    expect(result.tokensPerSecond).toBe(25);
  });

  // AC-MR-7
  it('uses each slot model when "same model for both" is off', async () => {
    const { calls, fetchFn } = fakeFetch(() => ollamaReply('x'));
    const settings: ModelSettings = {
      ...DEFAULT_MODEL_SETTINGS,
      sameModelForBoth: false,
      drafting: { model: 'gemma3:12b-it-qat', numCtx: 8192 },
    };
    const { client } = makeClient(settings, fetchFn);
    const base = { promptId: 'p', promptVersion: 1, messages: [{ role: 'user' as const, content: 'x' }] };

    await client.chat({ ...base, slot: 'mapping', stage: 'planning', temperature: 0.2 });
    await client.chat({ ...base, slot: 'drafting', stage: 'drafting', temperature: 0.6 });

    expect(calls[0]?.body).toMatchObject({ model: 'gemma3:4b-it-qat', options: { num_ctx: 16384 } });
    expect(calls[1]?.body).toMatchObject({ model: 'gemma3:12b-it-qat', options: { num_ctx: 8192, temperature: 0.6 } });
  });

  // AC-MR-3
  it('throws before any request when the endpoint is not loopback', async () => {
    const { calls, fetchFn } = fakeFetch(() => ollamaReply('x'));
    const { client } = makeClient({ ...DEFAULT_MODEL_SETTINGS, endpoint: 'http://192.168.1.5:11434' }, fetchFn);
    await expect(client.version()).rejects.toMatchObject({ kind: 'not-loopback' });
    await expect(
      client.chat({
        slot: 'mapping',
        stage: 'planning',
        promptId: 'p',
        promptVersion: 1,
        messages: [],
        temperature: 0.2,
      }),
    ).rejects.toBeInstanceOf(ModelError);
    expect(calls).toHaveLength(0);
  });

  it('reports a 403 as a CORS problem', async () => {
    const { fetchFn } = fakeFetch(() => new Response('', { status: 403 }));
    const { client } = makeClient(DEFAULT_MODEL_SETTINGS, fetchFn);
    await expect(client.version()).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('reports a network failure as unreachable', async () => {
    const fetchFn = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const { client } = makeClient(DEFAULT_MODEL_SETTINGS, fetchFn);
    await expect(client.version()).rejects.toMatchObject({ kind: 'unreachable' });
  });

  it('lists installed models from /api/tags', async () => {
    const { fetchFn } = fakeFetch(() => json({ models: [{ name: 'gemma3:4b-it-qat' }, { name: 'qwen3:4b' }] }));
    const { client } = makeClient(DEFAULT_MODEL_SETTINGS, fetchFn);
    expect(await client.listModels()).toEqual(['gemma3:4b-it-qat', 'qwen3:4b']);
  });

  // AC-MR-8
  it('logs model, tokens and latency without prompt or response text', async () => {
    const { fetchFn } = fakeFetch(() => ollamaReply('SECRET RESPONSE'));
    const { client, stats } = makeClient(DEFAULT_MODEL_SETTINGS, fetchFn);
    await client.chat({
      slot: 'mapping',
      stage: 'planning',
      promptId: 'plan',
      promptVersion: 3,
      messages: [{ role: 'user', content: 'SECRET PROMPT' }],
      temperature: 0.2,
    });
    expect(stats.rows).toHaveLength(1);
    expect(stats.rows[0]).toMatchObject({
      model: 'gemma3:4b-it-qat',
      promptId: 'plan',
      promptVersion: 3,
      stage: 'planning',
      inputTokens: 120,
      outputTokens: 50,
      latencyMs: 250,
      ok: true,
    });
    expect(JSON.stringify(stats.rows)).not.toMatch(/SECRET/);
  });

  it('logs failed calls too', async () => {
    const { fetchFn } = fakeFetch(() => new Response('boom', { status: 500 }));
    const { client, stats } = makeClient(DEFAULT_MODEL_SETTINGS, fetchFn);
    await expect(
      client.chat({ slot: 'mapping', stage: 'planning', promptId: 'p', promptVersion: 1, messages: [], temperature: 0.2 }),
    ).rejects.toMatchObject({ kind: 'http' });
    expect(stats.rows[0]).toMatchObject({ ok: false });
  });
});

describe('ModelClient (OpenAI-compatible)', () => {
  const settings: ModelSettings = { ...DEFAULT_MODEL_SETTINGS, endpoint: 'http://127.0.0.1:1234', apiStyle: 'openai' };

  // AC-MR-2
  it('uses /v1/chat/completions with a json_schema response_format', async () => {
    const { calls, fetchFn } = fakeFetch(() =>
      json({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    );
    const { client } = makeClient(settings, fetchFn);
    const result = await client.chat({
      slot: 'mapping',
      stage: 'planning',
      promptId: 'plan',
      promptVersion: 1,
      messages: [{ role: 'user', content: 'hi' }],
      schema,
      temperature: 0.2,
    });
    expect(calls[0]?.url).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(calls[0]?.body).toMatchObject({
      model: 'gemma3:4b-it-qat',
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: { schema } },
    });
    expect(result).toMatchObject({ content: '{"ok":true}', inputTokens: 10, outputTokens: 5 });
  });

  it('lists models from /v1/models', async () => {
    const { calls, fetchFn } = fakeFetch(() => json({ data: [{ id: 'gemma-3-4b-it' }] }));
    const { client } = makeClient(settings, fetchFn);
    expect(await client.listModels()).toEqual(['gemma-3-4b-it']);
    expect(calls[0]?.url).toBe('http://127.0.0.1:1234/v1/models');
  });
});
