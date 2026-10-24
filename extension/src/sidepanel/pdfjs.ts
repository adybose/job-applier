import * as pdfjs from 'pdfjs-dist';
// Bundled with the extension (spec 01 R-PS-4: no CDN).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { GetDocument } from '../shared/profile/pdf';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const getDocument: GetDocument = (params) =>
  pdfjs.getDocument({ ...params, verbosity: 0 }) as unknown as ReturnType<GetDocument>;
