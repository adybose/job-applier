// Spec 07 R-MR-10: a deliberately conservative estimate; no tokenizer ships with the extension.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Splits text into chunks of at most maxTokens, breaking on line boundaries. */
export function chunkByLines(text: string, maxTokens: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxTokens * 3.5));
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    const piece = line.length > maxChars ? line.slice(0, maxChars) : line;
    if (current && current.length + piece.length + 1 > maxChars) {
      chunks.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + piece;
  }
  if (current) chunks.push(current);
  return chunks;
}
