import type { ChatMessage } from '../shared/model/client';

// Spec 07 R-MR-13: every prompt has an id and a version; bump the version on any wording change.
export interface PromptTemplate<Input> {
  id: string;
  version: number;
  build(input: Input): ChatMessage[];
}

/** Wraps untrusted text in delimiters (spec 01 R-PS-10). Strips look-alike delimiters from the text itself. */
export function wrapData(tag: 'PAGE_DATA' | 'DOCUMENT', text: string): string {
  const clean = text.replace(/<<<\s*[A-Z_]+|[A-Z_]+\s*>>>/g, '');
  return `<<<${tag}\n${clean}\n${tag}>>>`;
}
