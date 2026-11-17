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

/** Recherche hybride. */
export const SEARCH_RESULTS_LIMIT = 20
/** Nombre de candidats récupérés par chaque méthode avant fusion. */
export const SEARCH_CANDIDATES = 60
/** Constante de la Reciprocal Rank Fusion (valeur usuelle). */
export const RRF_K = 60
/** Délai max pour vectoriser la requête ; au-delà, recherche par mots-clés seule. */
export const QUERY_EMBEDDING_TIMEOUT_MS = 4_000
/**
 * Filtrage des résultats sémantiques (distance cosinus, 0 = identique) : on garde ceux qui sont
 * proches du meilleur résultat, sous un plafond absolu, pour ne pas afficher de pages sans rapport.
 * Calibré sur multilingual-e5-small (autotest CI, identique Windows/Linux) : page pertinente ≈ 0,14,
 * page sans rapport ≈ 0,17–0,20. À recalibrer si le modèle change.
 */
export const SEMANTIC_MAX_DISTANCE = 0.165
export const SEMANTIC_RELATIVE_MARGIN = 0.03
