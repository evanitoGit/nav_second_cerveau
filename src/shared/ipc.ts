import type { ChromeInsets, CreateTabOptions, TabsSnapshot, UiCommand } from './types'

/** Noms des canaux IPC — source unique de vérité pour Main, Preload et Renderer. */
export const IpcChannels = {
  // Renderer -> Main (invoke) — navigation de l'onglet actif
  navNavigate: 'nav:navigate',
  navBack: 'nav:back',
  navForward: 'nav:forward',
  navReload: 'nav:reload',
  navStop: 'nav:stop',
  // Renderer -> Main (invoke) — onglets
  tabsGetSnapshot: 'tabs:get-snapshot',
  tabsCreate: 'tabs:create',
  tabsClose: 'tabs:close',
  tabsActivate: 'tabs:activate',
  tabsMove: 'tabs:move',
  // Renderer -> Main (send)
  layoutSetInsets: 'layout:set-insets',
  // Main -> Renderer (événements)
  tabsChanged: 'tabs:changed',
  uiCommand: 'ui:command'
} as const

/** API exposée au Renderer via contextBridge sous `window.api`. */
export interface BrowserApi {
  /** Agit toujours sur l'onglet actif. */
  navigation: {
    navigate(input: string): Promise<void>
    back(): Promise<void>
    forward(): Promise<void>
    reload(): Promise<void>
    stop(): Promise<void>
  }
  tabs: {
    getSnapshot(): Promise<TabsSnapshot>
    create(options?: CreateTabOptions): Promise<void>
    close(tabId: number): Promise<void>
    activate(tabId: number): Promise<void>
    move(tabId: number, toIndex: number): Promise<void>
    /** Retourne une fonction de désabonnement. */
    onChanged(listener: (snapshot: TabsSnapshot) => void): () => void
  }
  ui: {
    onCommand(listener: (command: UiCommand) => void): () => void
  }
  layout: {
    setChromeInsets(insets: ChromeInsets): void
  }
}
