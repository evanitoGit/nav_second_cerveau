import type { WebContents } from 'electron'
import readabilitySource from '@mozilla/readability/Readability.js?raw'
import type { ExtractedContent } from '../workers/types'
import { MAX_TEXT_LENGTH } from '../memory/config'

/** Monde JavaScript isolé : la page ne peut ni voir ni altérer Readability ni notre script. */
const ISOLATED_WORLD_ID = 1001
const EXTRACTION_TIMEOUT_MS = 5_000

/**
 * Script exécuté dans la page : Readability travaille sur un clone du DOM (la page n'est pas modifiée).
 * À défaut d'article détecté, on retombe sur le texte visible du <body>.
 */
const EXTRACT_SCRIPT = `${readabilitySource}
;(() => {
  const meta = (selector) => document.querySelector(selector)?.getAttribute('content')?.trim() || null
  let article = null
  try {
    article = new Readability(document.cloneNode(true), { charThreshold: 300 }).parse()
  } catch (e) {}
  const raw = (article && article.textContent && article.textContent.trim().length > 200)
    ? article.textContent
    : (document.body ? document.body.innerText : '')
  const text = raw
    .replace(/\\r/g, '')
    .replace(/[ \\t\\u00a0]+/g, ' ')
    .replace(/ *\\n */g, '\\n')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim()
    .slice(0, ${MAX_TEXT_LENGTH})
  return {
    title: (article && article.title) || document.title || location.href,
    siteName: (article && article.siteName) || meta('meta[property="og:site_name"]'),
    byline: (article && article.byline) || meta('meta[name="author"]'),
    excerpt: (article && article.excerpt) || meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    lang: (article && article.lang) || document.documentElement.lang || null,
    text
  }
})()`

export async function extractContent(contents: WebContents): Promise<ExtractedContent> {
  const extraction = contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD_ID, [{ code: EXTRACT_SCRIPT }])
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("délai d'extraction dépassé")), EXTRACTION_TIMEOUT_MS)
  )
  const result = (await Promise.race([extraction, timeout])) as Partial<ExtractedContent> | null
  if (!result || typeof result.text !== 'string') throw new Error('extraction vide')

  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  return {
    title: str(result.title, 500) ?? contents.getURL(),
    siteName: str(result.siteName, 200),
    byline: str(result.byline, 200),
    excerpt: str(result.excerpt, 1000),
    lang: str(result.lang, 20),
    text: result.text
  }
}
