import { CHUNK_TARGET_CHARS, MAX_CHUNKS_PER_PAGE } from './config'

/**
 * Découpe un texte en morceaux d'environ CHUNK_TARGET_CHARS caractères,
 * en respectant autant que possible les paragraphes puis les phrases.
 */
export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  const flush = () => {
    if (current) chunks.push(current)
    current = ''
  }

  for (const paragraph of paragraphs) {
    for (const piece of splitLong(paragraph)) {
      if (current && current.length + piece.length + 1 > CHUNK_TARGET_CHARS) flush()
      current = current ? `${current}\n${piece}` : piece
    }
    if (chunks.length >= MAX_CHUNKS_PER_PAGE) break
  }
  flush()
  return chunks.slice(0, MAX_CHUNKS_PER_PAGE)
}

/** Coupe un paragraphe trop long en phrases, puis en tranches si une phrase est démesurée. */
function splitLong(paragraph: string): string[] {
  if (paragraph.length <= CHUNK_TARGET_CHARS) return [paragraph]
  const sentences = paragraph.match(/[^.!?…]+[.!?…]+[\])'"»]*\s*|[^.!?…]+$/g) ?? [paragraph]
  const out: string[] = []
  for (const sentence of sentences.map((s) => s.trim()).filter(Boolean)) {
    for (let i = 0; i < sentence.length; i += CHUNK_TARGET_CHARS) {
      out.push(sentence.slice(i, i + CHUNK_TARGET_CHARS))
    }
  }
  return out
}
