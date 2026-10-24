import { z } from 'zod';
import { cvExtractionPrompt, linkedinExtractionPrompt } from '../../prompts/profile';
import type { ChatMessage, ModelClient } from '../model/client';
import { chunkByLines, estimateTokens } from '../model/tokens';
import { groundExtraction, linkedinSummary } from './grounding';
import { EMPTY_EXTRACTED, ExtractedProfileSchema, type ExtractedProfile } from './schema';

const OUTPUT_RESERVE = 4096;
const INSTRUCTION_RESERVE = 700;

export function jsonSchemaFor(schema: z.ZodType): object {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

const EXTRACTED_JSON_SCHEMA = jsonSchemaFor(ExtractedProfileSchema);

export type ExtractionResult =
  | { ok: true; data: ExtractedProfile }
  | { ok: false; partial: ExtractedProfile; error: string };

function parse(content: string): { ok: true; data: ExtractedProfile } | { ok: false; error: string; raw: unknown } {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { ok: false, error: 'The reply was not valid JSON.', raw: undefined };
  }
  const result = ExtractedProfileSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: z.prettifyError(result.error), raw };
}

/** Keeps every top-level field that is valid on its own, so the editor opens with what we could read. */
function salvage(raw: unknown): ExtractedProfile {
  const out: Record<string, unknown> = { ...EMPTY_EXTRACTED };
  if (raw && typeof raw === 'object') {
    for (const [key, schema] of Object.entries(ExtractedProfileSchema.shape)) {
      const result = (schema as z.ZodType).safeParse((raw as Record<string, unknown>)[key]);
      if (result.success) out[key] = result.data;
    }
  }
  return out as ExtractedProfile;
}

async function extractChunk(client: ModelClient, text: string, kind: 'cv' | 'linkedin'): Promise<ExtractionResult> {
  const prompt = kind === 'linkedin' ? linkedinExtractionPrompt : cvExtractionPrompt;
  const messages: ChatMessage[] = prompt.build({ text });
  let lastRaw: unknown;
  let lastError = '';
  // Spec 02 R-PI-5: one retry with the validation error, then fall back to a partial profile.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = await client.chat({
        slot: 'mapping',
        stage: 'extraction',
        promptId: prompt.id,
        promptVersion: prompt.version,
        messages,
        schema: EXTRACTED_JSON_SCHEMA,
        temperature: 0.2,
      });
      const parsed = parse(reply.content);
      if (parsed.ok) return parsed;
      lastRaw = parsed.raw ?? lastRaw;
      lastError = parsed.error;
      messages.push(
        { role: 'assistant', content: reply.content },
        { role: 'user', content: `That JSON did not match the schema:\n${parsed.error}\nReply again with only valid JSON.` },
      );
    } catch (err) {
      return { ok: false, partial: salvage(lastRaw), error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ok: false, partial: salvage(lastRaw), error: `We couldn't read everything from this file. ${lastError}` };
}

function mergeChunks(results: ExtractedProfile[]): ExtractedProfile {
  const out: ExtractedProfile = structuredClone(EMPTY_EXTRACTED);
  for (const r of results) {
    for (const key of Object.keys(out) as (keyof ExtractedProfile)[]) {
      const current = out[key];
      const incoming = r[key];
      if (Array.isArray(current) && Array.isArray(incoming)) {
        (out[key] as unknown[]) = [...current, ...incoming];
      } else if ((current === '' || current === null) && incoming) {
        (out as Record<string, unknown>)[key] = incoming;
      }
    }
  }
  return out;
}

/** Spec 02 R-PI-5/R-PI-6: extract with the Mapping model, chunking long documents to fit num_ctx. */
export async function extractProfile(
  client: ModelClient,
  text: string,
  kind: 'cv' | 'linkedin',
  numCtx: number,
): Promise<ExtractionResult> {
  const budget = numCtx - OUTPUT_RESERVE - INSTRUCTION_RESERVE;
  const chunks = estimateTokens(text) <= budget ? [text] : chunkByLines(text, budget);
  const results = [];
  for (const chunk of chunks) results.push(await extractChunk(client, chunk, kind));

  const { data } = groundExtraction(mergeChunks(results.map((r) => (r.ok ? r.data : r.partial))), text, {
    notBullets: kind === 'linkedin' ? linkedinSummary(text) : undefined,
  });
  const failed = results.find((r) => !r.ok);
  return failed && !failed.ok ? { ok: false, partial: data, error: failed.error } : { ok: true, data };
}
