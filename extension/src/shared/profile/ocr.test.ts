import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ingestFiles } from './ingest';
import { extractPdfText, scannedPages } from './pdf';
import { nodeGetDocument, recording, scriptedClient } from './test-helpers';

const SCANNED = join(import.meta.dirname, '../../../../fixtures/profiles/alex-rivera-scanned.pdf');
const TRANSCRIPT = `Alex Rivera
Senior Software Engineer
Portland, Oregon, USA | alex.rivera@example.com | +1 503 555 0142
github.com/alexrivera-dev | alexrivera.example.dev
EXPERIENCE
Globex Robotics - Senior Software Engineer
Portland, OR | 2021-03 to present
- Led the rewrite of the fleet telemetry pipeline in TypeScript, cutting alert latency by 60%.
- Mentored four engineers and ran the frontend guild.
- Built a React dashboard used by 300 field technicians.
Initech - Software Engineer
Remote | 2018-06 to 2021-02
- Maintained billing APIs in Node.js and PostgreSQL serving 2M requests per day.
- Introduced contract tests that cut production incidents by a third.
EDUCATION
Oregon State University - B.S. Computer Science, 2014 to 2018
SKILLS
TypeScript, React, Node.js, PostgreSQL, Python, Docker, AWS`;

describe('scanned PDFs (spec 02 R-PI-4)', () => {
  it('detects the image-only fixture as scanned', async () => {
    const buf = readFileSync(SCANNED);
    const pdf = await extractPdfText(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, nodeGetDocument);
    expect(scannedPages(pdf)).toEqual([1]);
  });

  it('renders scanned pages, transcribes them with images, then extracts as usual', async () => {
    fakeBrowser.reset();
    const { client, sent } = scriptedClient([TRANSCRIPT, JSON.stringify(recording('alex-rivera-profile-cv'))]);
    const rendered: number[][] = [];
    const file = new File([readFileSync(SCANNED)], 'alex-rivera-scanned.pdf', { type: 'application/pdf' });
    const draft = await ingestFiles(
      { cv: file },
      {
        client,
        numCtx: 16384,
        getDocument: nodeGetDocument,
        renderPages: async (_bytes, pages) => {
          rendered.push(pages);
          return pages.map(() => 'BASE64JPEG');
        },
      },
    );
    expect(rendered).toEqual([[1]]);
    const ocr = sent[0] as unknown as { messages: { content: string; images?: string[] }[]; options: { temperature: number } };
    expect(ocr.messages[1]?.images).toEqual(['BASE64JPEG']);
    expect(ocr.options.temperature).toBe(0);
    expect(sent[1]?.messages[1]?.content).toContain('alex.rivera@example.com');
    expect(draft.profile.identity.fullName.value).toBe('Alex Rivera');
    // Grounding runs against the transcript, so the CV's real jobs survive.
    expect(draft.profile.experience.map((e) => e.value.company)).toEqual(['Globex Robotics', 'Initech']);
    expect(draft.errors).toEqual([]);
  });

  it('explains when a scanned PDF cannot be read', async () => {
    fakeBrowser.reset();
    const { client } = scriptedClient([]);
    const file = new File([readFileSync(SCANNED)], 'scan.pdf', { type: 'application/pdf' });
    await expect(ingestFiles({ cv: file }, { client, numCtx: 16384, getDocument: nodeGetDocument })).rejects.toThrow(/no text found/);
  });
});
