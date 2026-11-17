import type { MemoryCaptureStatus } from './memory'

/** État de navigation d'une vue web. */
export interface NavigationState {
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** État d'un onglet tel que l'UI le voit. */
export interface TabState extends NavigationState {
  id: number
  /** Navigation privée : session en mémoire, jamais capturée ni indexée. */
  isPrivate: boolean
  /** Mémorisation de la page courante (indicateur dans la barre d'adresse). */
  memory: MemoryCaptureStatus
}

/** Instantané complet des onglets, poussé du Main vers l'UI à chaque changement. */
export interface TabsSnapshot {
  tabs: TabState[]
  activeTabId: number | null
}

export interface CreateTabOptions {
  url?: string
  isPrivate?: boolean
}

/** Commandes que le Main demande à l'UI d'exécuter (déclenchées par un raccourci clavier). */
export type UiCommand = 'focus-address-bar'

/**
 * Espace occupé par l'UI React autour de la WebContentsView (en pixels CSS).
 * `top` = barre d'onglets + barre d'adresse, `right` = sidebar Mémoire IA (étape suivante).
 */
export interface ChromeInsets {
  top: number
  right: number
}
