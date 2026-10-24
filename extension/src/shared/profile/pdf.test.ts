import { describe, expect, it } from 'vitest';
import { checkPdf, extractPdfText, isLinkedInExport, scannedPages } from './pdf';
import { fixtureBytes, nodeGetDocument } from './test-helpers';

describe('checkPdf', () => {
  // AC-PI-1
  it('rejects files over 10 MB', () => {
    const big = new Uint8Array(12 * 1024 * 1024);
    big.set(new TextEncoder().encode('%PDF-'));
    expect(checkPdf(big.buffer)).toEqual({ ok: false, error: 'This file is over 10 MB.' });
  });

  // AC-PI-2
  it('rejects a PNG renamed to .pdf', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkPdf(png.buffer)).toEqual({ ok: false, error: "This doesn't look like a PDF." });
  });

  it('accepts a real PDF', () => {
    expect(checkPdf(fixtureBytes('alex-rivera-cv.pdf'))).toEqual({ ok: true });
  });
});

describe('extractPdfText', () => {
  it('extracts lines in order', async () => {
    const pdf = await extractPdfText(fixtureBytes('alex-rivera-cv.pdf'), nodeGetDocument);
    expect(pdf.pages).toHaveLength(1);
    expect(pdf.text.split('\n').slice(0, 2)).toEqual(['Alex Rivera', 'Senior Software Engineer']);
    expect(pdf.text).toContain('alex.rivera@example.com');
    expect(scannedPages(pdf)).toEqual([]);
  });

  // AC-PI-3
  it('detects the LinkedIn export and not the CV', async () => {
    const cv = await extractPdfText(fixtureBytes('alex-rivera-cv.pdf'), nodeGetDocument);
    const li = await extractPdfText(fixtureBytes('alex-rivera-linkedin.pdf'), nodeGetDocument);
    expect(li.pages).toHaveLength(2);
    expect(li.text).not.toMatch(/Page \d of \d/);
    expect(isLinkedInExport(li.text)).toBe(true);
    expect(isLinkedInExport(cv.text)).toBe(false);
  });

  it('flags near-empty pages as scanned', () => {
    expect(scannedPages({ pages: ['short', 'x'.repeat(80)], text: '' })).toEqual([1]);
  });
});
