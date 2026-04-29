/**
 * Simple character-based chunking with overlap (MVP).
 * Tuned for ~1–2 short paragraphs per chunk for embedding.
 */
const DEFAULT_MAX = 1800;
const DEFAULT_OVERLAP = 250;
const MAX_CHUNKS_PER_ITEM = 80;

export function splitTextIntoChunks(
  text: string,
  maxChars: number = DEFAULT_MAX,
  overlap: number = DEFAULT_OVERLAP
): string[] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];

  const chunks: string[] = [];
  let i = 0;
  while (i < t.length && chunks.length < MAX_CHUNKS_PER_ITEM) {
    const end = Math.min(i + maxChars, t.length);
    let slice = t.slice(i, end);
    if (end < t.length) {
      const lastBreak = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf(" ")
      );
      if (lastBreak > maxChars * 0.4) {
        slice = slice.slice(0, lastBreak + 1);
      }
    }
    const piece = slice.trim();
    if (piece) chunks.push(piece);
    if (end >= t.length) break;
    i += Math.max(1, slice.length - overlap);
  }
  return chunks;
}
