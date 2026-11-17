import type { ChromeInsets, NavigationState } from './types'

/** Noms des canaux IPC — source unique de vérité pour Main, Preload et Renderer. */
export const IpcChannels = {
  // Renderer -> Main (invoke)
  navNavigate: 'nav:navigate',
  navBack: 'nav:back',
  navForward: 'nav:forward',
  navReload: 'nav:reload',
  navStop: 'nav:stop',
  navGetState: 'nav:get-state',
  layoutSetInsets: 'layout:set-insets',
  // Main -> Renderer (événements)
  navStateChanged: 'nav:state-changed'
} as const

/** API exposée au Renderer via contextBridge sous `window.api`. */
export interface BrowserApi {
  navigation: {
    navigate(input: string): Promise<void>
    back(): Promise<void>
    forward(): Promise<void>
    reload(): Promise<void>
    stop(): Promise<void>
    getState(): Promise<NavigationState>
    /** Retourne une fonction de désabonnement. */
    onStateChanged(listener: (state: NavigationState) => void): () => void
  }
  layout: {
    setChromeInsets(insets: ChromeInsets): void
  }
}
