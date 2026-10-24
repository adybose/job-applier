// Writes the fictional "Alex Rivera" CV and LinkedIn-export PDFs used by tests.
// Usage: node scripts/make-fixture-pdfs.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '../fixtures/profiles');

/** Minimal single-font text PDF. One string[] per page, one line per entry. */
export function makePdf(pages: string[][]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 font, then [page, content] pairs.
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  let next = 4;
  for (const lines of pages) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    const body = `BT /F1 11 Tf 14 TL 50 790 Td\n${lines.map((l) => `(${esc(l)}) Tj T*`).join('\n')}\nET`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
  }
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export const CV_PAGES = [
  [
    'Alex Rivera',
    'Senior Software Engineer',
    'Portland, Oregon, USA | alex.rivera@example.com | +1 503 555 0142',
    'github.com/alexrivera-dev | alexrivera.example.dev',
    '',
    'EXPERIENCE',
    'Globex Robotics - Senior Software Engineer',
    'Portland, OR | 2021-03 to present',
    '- Led the rewrite of the fleet telemetry pipeline in TypeScript, cutting alert latency by 60%.',
    '- Mentored four engineers and ran the frontend guild.',
    '- Built a React dashboard used by 300 field technicians.',
    'Initech - Software Engineer',
    'Remote | 2018-06 to 2021-02',
    '- Maintained billing APIs in Node.js and PostgreSQL serving 2M requests per day.',
    '- Introduced contract tests that cut production incidents by a third.',
    '',
    'EDUCATION',
    'Oregon State University - B.S. Computer Science, 2014 to 2018',
    '',
    'SKILLS',
    'TypeScript, React, Node.js, PostgreSQL, Python, Docker, AWS',
  ],
];

export const LINKEDIN_PAGES = [
  [
    'Contact',
    'alex@rivera.example',
    'www.linkedin.com/in/alex-rivera-example (LinkedIn)',
    'Top Skills',
    'TypeScript',
    'React',
    'Distributed Systems',
    'Languages',
    'English (Native or Bilingual)',
    'Spanish (Professional Working)',
    'Certifications',
    'AWS Certified Developer - Associate',
    'Alex Rivera',
    'Senior Software Engineer at Globex Robotics',
    'Portland, Oregon, United States',
    'Summary',
    'Engineer who likes turning messy data into tools people trust.',
    'Experience',
    'Globex Robotics',
    'Staff Software Engineer',
    'March 2021 - Present (3 years 8 months)',
    'Portland, Oregon',
    'Initech',
    'Software Engineer',
    'June 2018 - February 2021 (2 years 9 months)',
    'Page 1 of 2',
  ],
  [
    'Hooli',
    'Software Engineering Intern',
    'June 2017 - September 2017 (4 months)',
    'Mountain View, California',
    'Education',
    'Oregon State University',
    'Bachelor of Science - BS, Computer Science (2014 - 2018)',
    'Page 2 of 2',
  ],
];

if (process.argv[1] === import.meta.filename) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'alex-rivera-cv.pdf'), makePdf(CV_PAGES));
  writeFileSync(join(OUT, 'alex-rivera-linkedin.pdf'), makePdf(LINKEDIN_PAGES));
  console.log(`wrote fixture PDFs to ${OUT}`);
}
