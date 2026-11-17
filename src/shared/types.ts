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
  /** 1 = 100 %. */
  zoomFactor: number
  /** Échec de chargement de la page principale (affiché par l'UI à la place de la page). */
  error: { code: number; description: string; url: string } | null
}

/** Résultat de la recherche dans la page (Ctrl+F). */
export interface FindResult {
  tabId: number
  activeMatch: number
  matches: number
}

export type DownloadStatus = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadState {
  id: number
  filename: string
  path: string
  url: string
  receivedBytes: number
  totalBytes: number
  status: DownloadStatus
  startedAt: number
}

/** Autorisation demandée par un site, en attente de réponse de l'utilisateur. */
export interface PermissionPrompt {
  id: number
  /** Onglet demandeur : la barre n'est affichée que sur cet onglet. */
  tabId: number
  origin: string
  /** Permissions Chromium demandées (ex. ['media'] ou ['notifications']). */
  permission: string
  /** Pour 'media' : caméra et/ou micro. */
  mediaTypes: ('video' | 'audio')[]
  isPrivate: boolean
}

/** Instantané complet des onglets, poussé du Main vers l'UI à chaque changement. */
export interface TabsSnapshot {
  tabs: TabState[]
  activeTabId: number | null
}

export interface CreateTabOptions {
  url?: string
  isPrivate?: boolean
  /** false = ouvrir en arrière-plan. */
  activate?: boolean
}

/** Commandes que le Main demande à l'UI d'exécuter (déclenchées par un raccourci clavier). */
export type UiCommand = 'focus-address-bar' | 'toggle-memory' | 'open-find' | 'toggle-downloads'

/**
 * Espace occupé par l'UI React autour de la WebContentsView (en pixels CSS).
 * `top` = barre d'onglets + barre d'adresse, `right` = sidebar Mémoire IA (étape suivante).
 */
export interface ChromeInsets {
  top: number
  right: number
}
