import { describe, expect, it } from 'vitest';
import { extractProfile } from './extract';
import { ProfileSchema, profileFromExtracted } from './schema';
import { extractPdfText } from './pdf';
import { fixtureBytes, nodeGetDocument, recording, scriptedClient } from './test-helpers';

const cvJson = JSON.stringify(recording('alex-rivera-profile-cv'));

describe('extractProfile', () => {
  // AC-PI-4
  it('validates recorded output and tags every value with source "cv"', async () => {
    const { client, sent } = scriptedClient([cvJson]);
    const { text } = await extractPdfText(fixtureBytes('alex-rivera-cv.pdf'), nodeGetDocument);
    const result = await extractProfile(client, text, 'cv', 16384);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const profile = profileFromExtracted(result.data, 'cv');
    // Grounding keeps everything the CV really says.
    expect(profile.experience).toHaveLength(2);
    expect(profile.experience[0]?.value.bullets).toHaveLength(3);
    expect(profile.skills).toHaveLength(7);
    expect(ProfileSchema.safeParse(profile).success).toBe(true);
    const sources = [
      profile.identity.fullName.source,
      profile.contact.email.source,
      profile.links.github?.source,
      ...profile.experience.map((e) => e.source),
      ...profile.skills.map((s) => s.source),
    ];
    expect(new Set(sources)).toEqual(new Set(['cv']));
    expect(profile.links.linkedin).toBeUndefined();

    // The document is sent as delimited data with the CV prompt.
    const user = sent[0]?.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(user).toContain(`<<<DOCUMENT\n${text}\nDOCUMENT>>>`);
  });

  it('retries once with the validation error', async () => {
    const { client, sent } = scriptedClient(['{"fullName": 3}', cvJson]);
    const result = await extractProfile(client, 'text', 'cv', 16384);
    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.messages.at(-1)?.content).toMatch(/did not match the schema/);
  });

  // AC-PI-7
  it('returns partial data after two invalid replies without throwing', async () => {
    const { client } = scriptedClient(['not json', '{"email": "alex@x.com", "skills": ["Go"], "fullName": 7}']);
    const result = await extractProfile(client, 'text', 'cv', 16384);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.partial.email).toBe('alex@x.com');
    expect(result.partial.skills).toEqual(['Go']);
    expect(result.partial.fullName).toBe('');
    expect(result.error).toMatch(/couldn't read everything/);
  });

  it('chunks text that does not fit the context budget', async () => {
    const { client, sent } = scriptedClient(Array.from({ length: 20 }, () => cvJson));
    const long = Array.from({ length: 2000 }, (_, i) => `line ${i} with some words in it`).join('\n');
    const result = await extractProfile(client, long, 'cv', 8192);
    expect(sent.length).toBeGreaterThan(1);
    expect(result.ok).toBe(true);
    // Every chunk fits the 8192 budget.
    for (const body of sent) {
      const chars = body.messages.reduce((n, m) => n + m.content.length, 0);
      expect(Math.ceil(chars / 3.5)).toBeLessThanOrEqual(8192 - 4096);
    }
  });

  it('turns a model failure into an error result', async () => {
    const { client } = scriptedClient([]);
    // Force a network-level failure by breaking the endpoint at call time.
    (client as unknown as { settings: { endpoint: string } }).settings.endpoint = 'http://example.com';
    const result = await extractProfile(client, 'text', 'cv', 16384);
    expect(result.ok).toBe(false);
  });
});
