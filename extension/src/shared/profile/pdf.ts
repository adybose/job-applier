// Spec 02 R-PI-1..R-PI-3. PDF validation, local text extraction and LinkedIn-export detection.
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type PdfCheck = { ok: true } | { ok: false; error: string };

export function checkPdf(bytes: ArrayBuffer): PdfCheck {
  if (bytes.byteLength > MAX_PDF_BYTES) return { ok: false, error: 'This file is over 10 MB.' };
  const head = new TextDecoder('latin1').decode(new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)));
  if (head !== '%PDF-') return { ok: false, error: "This doesn't look like a PDF." };
  return { ok: true };
}

interface TextItemLike {
  str?: string;
  hasEOL?: boolean;
}

/** The slice of pdf.js we use, so tests can pass the legacy Node build. */
export type GetDocument = (params: { data: Uint8Array }) => {
  promise: Promise<{
    numPages: number;
    getPage(n: number): Promise<{ getTextContent(): Promise<{ items: TextItemLike[] }> }>;
  }>;
  destroy(): Promise<void>;
};

export interface PdfText {
  pages: string[];
  text: string;
}

export async function extractPdfText(bytes: ArrayBuffer, getDocument: GetDocument): Promise<PdfText> {
  const task = getDocument({ data: new Uint8Array(bytes.slice(0)) });
  const pages: string[] = [];
  try {
    const doc = await task.promise;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      let text = '';
      for (const item of items) {
        if (typeof item.str !== 'string') continue;
        text += item.str + (item.hasEOL ? '\n' : '');
      }
      pages.push(
        text
          .replace(/^\s*Page \d+ of \d+\s*$/gim, '') // LinkedIn exports; small models mistake these for data
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim(),
      );
    }
  } finally {
    await task.destroy();
  }
  return { pages, text: pages.join('\n\n') };
}

const LINKEDIN_HEADINGS = ['contact', 'top skills', 'summary', 'experience', 'education'];

/** A LinkedIn "Save to PDF" export has at least 3 of these as standalone lines (R-PI-3). */
export function isLinkedInExport(text: string): boolean {
  const lines = new Set(text.split('\n').map((l) => l.trim().toLowerCase()));
  return LINKEDIN_HEADINGS.filter((h) => lines.has(h)).length >= 3;
}

/** P1 (R-PI-4): pages with almost no text are probably scans. */
export function scannedPages(pdf: PdfText): number[] {
  return pdf.pages.flatMap((p, i) => (p.replace(/\s/g, '').length < 50 ? [i + 1] : []));
}
