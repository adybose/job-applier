// Mock Ollama + OpenAI-compatible server for tests (spec 10 R-TE-7). No GPU needed.
// Run: node mock-model/server.ts [port]   (Node's built-in TypeScript type stripping)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeFromSchema } from './fake-from-schema.ts';

const PORT = Number(process.argv[2] ?? process.env.MOCK_MODEL_PORT ?? 11435);
const RECORDINGS_DIR = join(import.meta.dirname, 'recordings');
const MODELS = (process.env.MOCK_MODELS ?? 'gemma3:4b-it-qat,gemma3:12b-it-qat,embeddinggemma:latest').split(',');
const TOKENS_PER_SECOND = 50;

type Mode = 'ok' | 'invalid-json' | 'forbidden' | 'error';

interface Recording {
  name: string;
  match: string[];
  response?: unknown;
  /** Plan prompts: answer each "id | kind | label | …" line by label (regex source, case-insensitive). */
  planByLabel?: Record<string, { value: string; confidence?: number; sensitive?: boolean }>;
}

/** Builds a plan reply for whatever field ids the prompt lists. Unknown labels are skipped. */
function planReply(text: string, byLabel: NonNullable<Recording['planByLabel']>): string {
  const fieldsBlock = text.split('FORM FIELDS')[1] ?? '';
  const actions = [];
  for (const line of fieldsBlock.split('\n')) {
    const [id, , label] = line.split(' | ').map((x) => x.trim());
    if (!id || !label || !id.startsWith('la-')) continue;
    const hit = Object.entries(byLabel).find(([re]) => new RegExp(re, 'i').test(label));
    actions.push(
      hit
        ? { field_id: id, value: hit[1].value, skip: false, confidence: hit[1].confidence ?? 0.9, rationale: 'mock', sensitive: hit[1].sensitive ?? false }
        : { field_id: id, value: '', skip: true, confidence: 0, rationale: 'mock: not in profile', sensitive: false },
    );
  }
  return JSON.stringify({ actions });
}

interface LoggedRequest {
  method: string;
  path: string;
  body: unknown;
}

const state = {
  mode: 'ok' as Mode,
  delayMs: 0,
  models: MODELS,
  requests: [] as LoggedRequest[],
};

function loadRecordings(): Recording[] {
  let files: string[];
  try {
    files = readdirSync(RECORDINGS_DIR).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
  return files.map((f) => ({ name: f, ...JSON.parse(readFileSync(join(RECORDINGS_DIR, f), 'utf8')) }) as Recording);
}

interface ChatBody {
  model?: string;
  messages?: { content?: string }[];
  format?: unknown;
  response_format?: { json_schema?: { schema?: unknown } };
}

function replyContent(body: ChatBody): string {
  const text = (body.messages ?? []).map((m) => m.content ?? '').join('\n');
  const recording = loadRecordings().find((r) => r.match.every((s) => text.includes(s)));
  if (recording?.planByLabel) return planReply(text, recording.planByLabel);
  if (recording) {
    return typeof recording.response === 'string' ? recording.response : JSON.stringify(recording.response);
  }
  const schema = body.format ?? body.response_format?.json_schema?.schema;
  if (schema && typeof schema === 'object') return JSON.stringify(fakeFromSchema(schema));
  return 'Mock model reply.';
}

const estimateTokens = (s: string) => Math.ceil(s.length / 3.5);

/** Deterministic 64-dimension bag-of-words vector, so identical questions embed identically. */
function bagOfWords(text: string): number[] {
  const v = new Array<number>(64).fill(0);
  for (const word of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
    let h = 0;
    for (const c of word) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % 64] = (v[h % 64] ?? 0) + 1;
  }
  return v;
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
  });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`).pathname;
  const body = await readBody(req);

  if (req.method === 'OPTIONS') return send(res, 204, '');

  // Test control endpoints.
  if (path === '/__mock/mode') {
    const next = body as { mode?: Mode; delayMs?: number; models?: string[] };
    state.mode = next.mode ?? 'ok';
    state.delayMs = next.delayMs ?? 0;
    state.models = next.models ?? MODELS;
    return send(res, 200, { ok: true });
  }
  if (path === '/__mock/requests') return send(res, 200, state.requests);
  if (path === '/__mock/reset') {
    state.mode = 'ok';
    state.delayMs = 0;
    state.models = MODELS;
    state.requests = [];
    return send(res, 200, { ok: true });
  }

  state.requests.push({ method: req.method ?? 'GET', path, body });
  if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
  if (state.mode === 'forbidden') return send(res, 403, '');
  if (state.mode === 'error') return send(res, 500, { error: 'mock error' });

  switch (path) {
    case '/api/version':
      return send(res, 200, { version: 'mock' });
    case '/api/tags':
      return send(res, 200, { models: state.models.map((name) => ({ name, model: name })) });
    case '/v1/models':
      return send(res, 200, { object: 'list', data: state.models.map((id) => ({ id, object: 'model' })) });
    case '/api/chat': {
      const chat = body as ChatBody;
      const content = state.mode === 'invalid-json' ? '{"not": valid json' : replyContent(chat);
      const evalCount = estimateTokens(content);
      return send(res, 200, {
        model: chat.model,
        message: { role: 'assistant', content },
        done: true,
        prompt_eval_count: estimateTokens(JSON.stringify(chat.messages ?? [])),
        eval_count: evalCount,
        eval_duration: Math.round((evalCount / TOKENS_PER_SECOND) * 1e9),
      });
    }
    case '/v1/chat/completions': {
      const chat = body as ChatBody;
      const content = state.mode === 'invalid-json' ? '{"not": valid json' : replyContent(chat);
      return send(res, 200, {
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: estimateTokens(JSON.stringify(chat.messages ?? [])), completion_tokens: estimateTokens(content) },
      });
    }
    case '/api/embed': {
      const input = (body as { input?: string | string[] }).input ?? [];
      return send(res, 200, { embeddings: (Array.isArray(input) ? input : [input]).map(bagOfWords) });
    }
    default:
      return send(res, 404, { error: `mock has no ${path}` });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock model listening on http://127.0.0.1:${PORT}`);
});
