/** Paramètres du pipeline de mémoire (partagés par le Main et les workers). */

/** Temps passé sur une page avant de la mémoriser. */
export const DWELL_MS = 5_000

/** Une page déjà capturée depuis moins longtemps (et inchangée) n'est pas recapturée. */
export const RECAPTURE_AFTER_MS = 6 * 60 * 60 * 1000

/** Deux passages sur la même page à moins de cet intervalle comptent pour une seule visite. */
export const VISIT_DEDUP_MS = 30 * 60 * 1000

/** En dessous, la page est jugée sans contenu textuel utile. */
export const MIN_TEXT_LENGTH = 80
export const MAX_TEXT_LENGTH = 200_000

/** Découpage du texte pour les embeddings. */
export const CHUNK_TARGET_CHARS = 900
export const MAX_CHUNKS_PER_PAGE = 48

/** Miniature stockée (largeur en pixels, qualité WebP). */
export const SCREENSHOT_WIDTH = 800
export const SCREENSHOT_QUALITY = 70

/**
 * Modèle d'embeddings multilingue (français compris), 384 dimensions, ~120 Mo en q8.
 * Téléchargé depuis Hugging Face au premier usage puis mis en cache localement.
 * Le modèle e5 attend les préfixes « query: » et « passage: ».
 */
export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small'
export const EMBEDDING_DIMS = 384
export const EMBEDDING_BATCH_SIZE = 8

/** Pages jamais mémorisées (pages de connexion, etc.). */
export const CAPTURE_EXCLUDED_HOSTS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com'
]
