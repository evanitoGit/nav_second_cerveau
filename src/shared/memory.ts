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
