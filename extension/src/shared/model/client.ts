import { isLoopbackUrl, LOOPBACK_ERROR } from './loopback';
import { resolveSlot, type ModelSettings, type SlotName } from './settings';
import type { Stage, StatsSink } from './stats';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

export interface ChatRequest {
  slot: SlotName;
  stage: Stage;
  promptId: string;
  promptVersion: number;
  messages: ChatMessage[];
  schema?: object;
  temperature: number;
}

export interface ChatResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  tokensPerSecond?: number;
}

export type ModelErrorKind = 'not-loopback' | 'unreachable' | 'forbidden' | 'timeout' | 'http' | 'bad-response';

export class ModelError extends Error {
  constructor(
    readonly kind: ModelErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

export interface ModelClientDeps {
  fetch: typeof fetch;
  now: () => number;
  stats: StatsSink;
}

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class ModelClient {
  constructor(
    private readonly settings: ModelSettings,
    private readonly deps: ModelClientDeps,
  ) {}

  /** Cheapest reachability probe. Ollama: /api/version. OpenAI-compatible: /v1/models. */
  async version(): Promise<string> {
    if (this.settings.apiStyle === 'openai') {
      await this.request('GET', '/v1/models');
      return 'openai-compatible';
    }
    const data = (await this.request('GET', '/api/version')) as { version?: string };
    return data.version ?? 'unknown';
  }

  async listModels(): Promise<string[]> {
    if (this.settings.apiStyle === 'openai') {
      const data = (await this.request('GET', '/v1/models')) as { data?: { id: string }[] };
      return (data.data ?? []).map((m) => m.id);
    }
    const data = (await this.request('GET', '/api/tags')) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  }

  /** Spec 09 R-AM-4: embeddings for answer memory (Ollama /api/embed or OpenAI-compatible /v1/embeddings). */
  async embed(model: string, input: string[]): Promise<number[][]> {
    const started = this.deps.now();
    let ok = false;
    try {
      let vectors: number[][];
      if (this.settings.apiStyle === 'openai') {
        const data = (await this.request('POST', '/v1/embeddings', { model, input })) as { data?: { embedding: number[] }[] };
        vectors = (data.data ?? []).map((d) => d.embedding);
      } else {
        const data = (await this.request('POST', '/api/embed', { model, input })) as { embeddings?: number[][] };
        vectors = data.embeddings ?? [];
      }
      if (vectors.length !== input.length) throw new ModelError('bad-response', 'The embedding model sent the wrong number of vectors.');
      ok = true;
      return vectors;
    } finally {
      await this.deps.stats
        .log({
          ts: Date.now(),
          model,
          promptId: 'embed',
          promptVersion: 1,
          stage: 'embedding',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: this.deps.now() - started,
          ok,
        })
        .catch(() => undefined);
    }
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const slot = resolveSlot(this.settings, req.slot);
    const started = this.deps.now();
    let result: ChatResult | undefined;
    try {
      result =
        this.settings.apiStyle === 'openai'
          ? await this.chatOpenAI(req, slot.model)
          : await this.chatOllama(req, slot.model, slot.numCtx);
      return result;
    } finally {
      const latencyMs = this.deps.now() - started;
      if (result) result.latencyMs = latencyMs;
      await this.deps.stats
        .log({
          ts: Date.now(),
          model: slot.model,
          promptId: req.promptId,
          promptVersion: req.promptVersion,
          stage: req.stage,
          inputTokens: result?.inputTokens ?? 0,
          outputTokens: result?.outputTokens ?? 0,
          latencyMs,
          ok: result !== undefined,
        })
        .catch(() => undefined);
    }
  }

  private async chatOllama(req: ChatRequest, model: string, numCtx: number): Promise<ChatResult> {
    // Spec 07 R-MR-1: num_ctx and temperature on every call; Ollama's default context silently truncates.
    const data = (await this.request('POST', '/api/chat', {
      model,
      messages: req.messages,
      stream: false,
      ...(req.schema ? { format: req.schema } : {}),
      options: { num_ctx: numCtx, temperature: req.temperature },
    })) as OllamaChatResponse;
    const content = data.message?.content;
    if (typeof content !== 'string') throw new ModelError('bad-response', 'The model sent an empty reply.');
    const outputTokens = data.eval_count ?? 0;
    return {
      content,
      model,
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens,
      latencyMs: 0,
      tokensPerSecond: data.eval_duration ? outputTokens / (data.eval_duration / 1e9) : undefined,
    };
  }

  private async chatOpenAI(req: ChatRequest, model: string): Promise<ChatResult> {
    const data = (await this.request('POST', '/v1/chat/completions', {
      model,
      messages: req.messages.map(({ role, content }) => ({ role, content })),
      temperature: req.temperature,
      stream: false,
      ...(req.schema
        ? { response_format: { type: 'json_schema', json_schema: { name: req.promptId, schema: req.schema, strict: true } } }
        : {}),
    })) as OpenAIChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new ModelError('bad-response', 'The model sent an empty reply.');
    return {
      content,
      model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      latencyMs: 0,
    };
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    // Spec 01 R-PS-2 / spec 07 R-MR-3: checked at call time, not only when settings are saved.
    if (!isLoopbackUrl(this.settings.endpoint)) throw new ModelError('not-loopback', LOOPBACK_ERROR);
    const url = this.settings.endpoint.replace(/\/+$/, '') + path;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    let res: Response;
    try {
      res = await this.deps.fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) throw new ModelError('timeout', 'The model took too long to answer.');
      throw new ModelError('unreachable', `Can't reach the model at ${this.settings.endpoint}. (${String(err)})`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 403) {
      throw new ModelError('forbidden', 'The model server blocked Lazy Apply. Allow the extension in OLLAMA_ORIGINS.');
    }
    if (!res.ok) throw new ModelError('http', `The model server answered ${res.status}.`);
    try {
      return await res.json();
    } catch {
      throw new ModelError('bad-response', 'The model server sent something that is not JSON.');
    }
  }
}
