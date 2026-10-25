import { ocrPrompt } from '../../prompts/ocr';
import type { ModelClient } from '../model/client';
import { scannedPages, type PdfText } from './pdf';

/** Renders the given 1-based pages of a PDF to base64 JPEG/PNG images (no data: prefix). */
export type RenderPages = (bytes: ArrayBuffer, pages: number[]) => Promise<string[]>;

export const MAX_SCANNED_PAGES = 3;

/**
 * Spec 02 R-PI-4: pages with almost no text are rendered and transcribed by the (multimodal) mapping model.
 * Returns the PDF text with those pages replaced, and how many pages were transcribed.
 */
export async function fillScannedPages(
  pdf: PdfText,
  bytes: ArrayBuffer,
  deps: { client: ModelClient; render?: RenderPages },
): Promise<{ pdf: PdfText; transcribed: number }> {
  const pages = scannedPages(pdf).slice(0, MAX_SCANNED_PAGES);
  if (!pages.length || !deps.render) return { pdf, transcribed: 0 };
  const images = await deps.render(bytes, pages);
  const texts = [...pdf.pages];
  let transcribed = 0;
  for (const [i, page] of pages.entries()) {
    const image = images[i];
    if (!image) continue;
    const reply = await deps.client.chat({
      slot: 'mapping',
      stage: 'extraction',
      promptId: ocrPrompt.id,
      promptVersion: ocrPrompt.version,
      messages: ocrPrompt.build({ image, page }),
      temperature: 0,
    });
    texts[page - 1] = reply.content.trim();
    transcribed++;
  }
  return { pdf: { pages: texts, text: texts.join('\n\n') }, transcribed };
}
