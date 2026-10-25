import * as pdfjs from 'pdfjs-dist';
// Bundled with the extension (spec 01 R-PS-4: no CDN).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { RenderPages } from '../shared/profile/ocr';
import type { GetDocument } from '../shared/profile/pdf';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const getDocument: GetDocument = (params) =>
  pdfjs.getDocument({ ...params, verbosity: 0 }) as unknown as ReturnType<GetDocument>;

/** Spec 02 R-PI-4: renders pages to JPEG (base64, no prefix) for the multimodal model. */
export const renderPages: RenderPages = async (bytes, pages) => {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), verbosity: 0 });
  try {
    const doc = await task.promise;
    const out: string[] = [];
    for (const n of pages) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 1400 / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      out.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1] ?? '');
    }
    return out;
  } finally {
    await task.destroy();
  }
};
