/** État de navigation d'une vue web, poussé du Main vers l'UI. */
export interface NavigationState {
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/**
 * Espace occupé par l'UI React autour de la WebContentsView (en pixels CSS).
 * `top` = barre d'onglets + barre d'adresse, `right` = sidebar Mémoire IA (étape suivante).
 */
export interface ChromeInsets {
  top: number
  right: number
}
