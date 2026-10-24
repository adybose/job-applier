import type { ModelClient } from '../model/client';
import { extractProfile } from './extract';
import { saveFile } from './files';
import { mergeProfiles } from './merge';
import { checkPdf, extractPdfText, isLinkedInExport, type GetDocument } from './pdf';
import { profileFromExtracted, type Profile } from './schema';
import type { ProfileDraft } from './storage';

export interface IngestInput {
  cv?: File;
  linkedin?: File;
}

export type IngestProgress = (message: string) => void;

/** Spec 02: validate, store, extract and merge the uploaded PDFs into a draft profile. */
export async function ingestFiles(
  input: IngestInput,
  deps: { client: ModelClient; numCtx: number; getDocument: GetDocument; onProgress?: IngestProgress },
): Promise<ProfileDraft> {
  const errors: string[] = [];
  const results: { slot: 'cv' | 'linkedin'; profile: Profile }[] = [];

  for (const slot of ['cv', 'linkedin'] as const) {
    const file = input[slot];
    if (!file) continue;
    const label = slot === 'cv' ? 'CV' : 'LinkedIn PDF';
    const bytes = await file.arrayBuffer();
    const check = checkPdf(bytes);
    if (!check.ok) {
      errors.push(`${label}: ${check.error}`);
      continue;
    }

    await saveFile({ kind: slot === 'cv' ? 'resume' : 'linkedin', name: file.name, type: 'application/pdf', size: file.size, bytes });

    deps.onProgress?.(`Reading your ${label}…`);
    const pdf = await extractPdfText(bytes, deps.getDocument);
    // R-PI-3: pick the prompt by content, so a LinkedIn export in the CV slot still reads well.
    const kind = isLinkedInExport(pdf.text) ? 'linkedin' : 'cv';

    deps.onProgress?.(`Understanding your ${label} with the local model…`);
    const extracted = await extractProfile(deps.client, pdf.text, kind, deps.numCtx);
    if (!extracted.ok) errors.push(`${label}: ${extracted.error}`);
    results.push({ slot, profile: profileFromExtracted(extracted.ok ? extracted.data : extracted.partial, kind) });
  }

  if (results.length === 0) {
    throw new Error(errors.join(' ') || 'Choose a CV or LinkedIn PDF first.');
  }
  const { profile, conflicts } = mergeProfiles(
    results.find((r) => r.slot === 'cv')?.profile,
    results.find((r) => r.slot === 'linkedin')?.profile,
  );
  return { profile, conflicts, errors };
}
