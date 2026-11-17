/**
 * État de mémorisation de la page affichée dans un onglet :
 * - idle      : rien en cours (page vierge, non web…)
 * - waiting   : l'utilisateur est sur la page, le délai de 5 s court
 * - capturing : extraction / capture d'écran en cours
 * - captured  : page enregistrée dans la mémoire locale
 * - skipped   : page exclue (onglet privé, site exclu, page sans texte…)
 */
export type MemoryCaptureStatus = 'idle' | 'waiting' | 'capturing' | 'captured' | 'skipped'

export interface MemoryStats {
  pages: number
  visits: number
  chunks: number
  embeddedChunks: number
  pendingPages: number
  /** null tant que le modèle n'a pas été chargé, message en cas d'échec. */
  embeddingModel: { id: string; status: 'idle' | 'loading' | 'ready' | 'error'; error?: string }
}

export interface MemorySearchResult {
  pageId: number
  url: string
  title: string
  siteName: string | null
  /** Extrait pertinent. Les passages correspondants sont encadrés par \u0002 … \u0003. */
  snippet: string
  /** URL `memory://` de la miniature, servie uniquement à l'UI du navigateur. */
  screenshotUrl: string | null
  lastVisitedAt: number
  visitCount: number
  matchedBy: { keywords: boolean; semantic: boolean }
  /** Distance cosinus du meilleur passage (diagnostic), si trouvé par le sens. */
  semanticDistance?: number
}

export interface MemorySearchResponse {
  query: string
  results: MemorySearchResult[]
  /** Période détectée dans la requête (« la semaine dernière »…). */
  range: { label: string; from: number; to: number } | null
  /** used = vecteurs utilisés ; unavailable = modèle pas prêt (mots-clés seuls) ; not-needed = requête purement temporelle. */
  semantic: 'used' | 'unavailable' | 'not-needed'
  tookMs: number
}

export const HIGHLIGHT_START = '\u0002'
export const HIGHLIGHT_END = '\u0003'
