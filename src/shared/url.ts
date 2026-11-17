const DEFAULT_SEARCH_URL = 'https://www.google.com/search?q='

/** Protocoles qu'on accepte de charger dans une vue web. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Transforme la saisie de la barre d'adresse en URL chargeable :
 * - URL complète http(s) -> telle quelle
 * - "exemple.com", "localhost:3000" -> https:// / http:// préfixé
 * - tout le reste -> recherche (moteur choisi dans les réglages)
 */
export function normalizeAddressInput(raw: string, searchUrl: string = DEFAULT_SEARCH_URL): string {
  const input = raw.trim()
  if (!input) return 'about:blank'

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    try {
      const url = new URL(input)
      if (ALLOWED_PROTOCOLS.has(url.protocol)) return url.toString()
    } catch {
      /* on retombe sur la recherche */
    }
    return searchUrl + encodeURIComponent(input)
  }

  const looksLikeHost =
    !/\s/.test(input) &&
    (/^localhost(:\d+)?(\/.*)?$/i.test(input) ||
      /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(input) ||
      /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(input))

  if (looksLikeHost) {
    const isLocal = /^(localhost|127\.|192\.168\.|10\.)/i.test(input)
    try {
      return new URL(`${isLocal ? 'http' : 'https'}://${input}`).toString()
    } catch {
      /* recherche */
    }
  }

  return searchUrl + encodeURIComponent(input)
}

export function isSafeWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_PROTOCOLS.has(parsed.protocol) || url === 'about:blank'
  } catch {
    return false
  }
}
