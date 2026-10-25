// Writes fixtures/profiles/alex-rivera-scanned.pdf: the fictional CV as a JPEG image only (no text layer),
// to exercise the scanned-PDF vision fallback (spec 02 R-PI-4). Usage: node scripts/make-scanned-pdf.ts
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CV_PAGES } from './make-fixture-pdfs.ts';

const OUT = join(import.meta.dirname, '../fixtures/profiles/alex-rivera-scanned.pdf');
const WIDTH = 1240; // ~150 dpi A4
const HEIGHT = 1754;

/** A one-page PDF that only draws a JPEG (DCTDecode) across the page. */
function imagePdf(jpeg: Buffer, w: number, h: number): Buffer {
  const pageW = 595;
  const pageH = 842;
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im1 Do Q`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`,
    null, // image, written as binary below
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
  const parts: Buffer[] = [header];
  const offsets: number[] = [];
  let size = header.length;
  objects.forEach((obj, i) => {
    offsets.push(size);
    const chunk =
      obj === null
        ? Buffer.concat([
            Buffer.from(
              `${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
              'latin1',
            ),
            jpeg,
            Buffer.from('\nendstream\nendobj\n', 'latin1'),
          ])
        : Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, 'latin1');
    parts.push(chunk);
    size += chunk.length;
  });
  const xref = size;
  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) tail += `${String(o).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  parts.push(Buffer.from(tail, 'latin1'));
  return Buffer.concat(parts);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const lines = (CV_PAGES[0] ?? []).map((l) => (l ? `<div>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>` : '<br>')).join('');
await page.setContent(
  `<body style="margin:90px 100px;font:24px/1.5 Georgia,serif;color:#222;background:#fbfaf6">
     <div style="font-size:44px;font-weight:bold">${lines.split('</div>')[0]?.replace('<div>', '')}</div>${lines.split('</div>').slice(1).join('</div>')}
   </body>`,
);
const jpeg = await page.screenshot({ type: 'jpeg', quality: 80 });
await browser.close();
writeFileSync(OUT, imagePdf(jpeg, WIDTH, HEIGHT));
console.log(`wrote ${OUT} (${jpeg.length} byte JPEG)`);
