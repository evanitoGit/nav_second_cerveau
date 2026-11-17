/** Réglages utilisateur, enregistrés dans settings.json. */
export interface Settings {
  memory: {
    /** false = mémorisation en pause (la recherche reste disponible). */
    enabled: boolean
    /** Domaines jamais mémorisés (sous-domaines inclus), ex. « banque.fr ». */
    excludedHosts: string[]
  }
  searchEngine: SearchEngineId
  homeUrl: string
  restoreSession: boolean
  adblock: { enabled: boolean }
}

export type SearchEngineId = 'google' | 'duckduckgo' | 'qwant' | 'bing' | 'ecosia'

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; url: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  qwant: { name: 'Qwant', url: 'https://www.qwant.com/?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' }
}

export const DEFAULT_SETTINGS: Settings = {
  memory: { enabled: true, excludedHosts: [] },
  searchEngine: 'google',
  homeUrl: 'https://www.wikipedia.org',
  restoreSession: true,
  adblock: { enabled: true }
}

/** « https://www.Exemple.fr/page » → « exemple.fr » ; null si invalide. */
export function normalizeHost(input: string): string | null {
  const raw = input.trim().toLowerCase()
  if (!raw) return null
  try {
    const host = new URL(/^[a-z]+:\/\//.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '')
    return /^[a-z0-9.-]+\.[a-z0-9-]+$|^localhost$/.test(host) ? host : null
  } catch {
    return null
  }
}

export function hostMatches(host: string, pattern: string): boolean {
  const h = host.replace(/^www\./, '')
  return h === pattern || h.endsWith(`.${pattern}`)
}
