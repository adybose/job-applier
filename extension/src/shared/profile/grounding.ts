import type { ExtractedProfile } from './schema';

// "Never invent experience" is enforced in code, not only in the prompt: anything the model
// returns for work history and education must be visibly present in the source document.

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];

/** Share of the claim's words (3+ chars) that appear somewhere in the document. */
export function groundedShare(claim: string, docWords: ReadonlySet<string>): number {
  const w = words(claim);
  if (w.length === 0) return 1;
  return w.filter((x) => docWords.has(x)).length / w.length;
}

const BULLET_MIN = 0.8;
const NAME_MIN = 0.6;

export interface GroundingReport {
  droppedBullets: number;
  droppedEntries: number;
}

/** The text of a LinkedIn export's Summary section, which small models like to copy into job bullets. */
export function linkedinSummary(text: string): string {
  return /^Summary\s*$([\s\S]*?)^Experience\s*$/m.exec(text)?.[1]?.trim() ?? '';
}

export function groundExtraction(
  data: ExtractedProfile,
  documentText: string,
  options: { notBullets?: string } = {},
): { data: ExtractedProfile; report: GroundingReport } {
  const docWords = new Set(words(documentText));
  const excluded = new Set(words(options.notBullets ?? ''));
  const report: GroundingReport = { droppedBullets: 0, droppedEntries: 0 };
  const ok = (text: string, min: number) => groundedShare(text, docWords) >= min;
  const okBullet = (text: string) => ok(text, BULLET_MIN) && !(excluded.size && groundedShare(text, excluded) >= BULLET_MIN);

  const experience = data.experience
    .filter((e) => {
      const keep = ok(e.company, NAME_MIN) && ok(e.title, NAME_MIN);
      if (!keep) report.droppedEntries++;
      return keep;
    })
    .map((e) => {
      const bullets = e.bullets.filter(okBullet);
      report.droppedBullets += e.bullets.length - bullets.length;
      return { ...e, bullets };
    });

  const education = data.education.filter((e) => {
    const keep = ok(e.institution, NAME_MIN);
    if (!keep) report.droppedEntries++;
    return keep;
  });

  const skills = data.skills.filter((s) => ok(s, NAME_MIN));
  const certifications = data.certifications.filter((c) => ok(c.name, NAME_MIN));

  return { data: { ...data, experience, education, skills, certifications }, report };
}
