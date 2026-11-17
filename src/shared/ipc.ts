import type { MemorySearchResponse, MemorySearchResult, MemoryStats } from './memory'
import type {
  ChromeInsets,
  CreateTabOptions,
  DownloadState,
  FindResult,
  PermissionPrompt,
  TabsSnapshot,
  UiCommand
} from './types'

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
  tabsZoom: 'tabs:zoom',
  findStart: 'find:start',
  findStop: 'find:stop',
  downloadsList: 'downloads:list',
  downloadsOpen: 'downloads:open',
  downloadsShow: 'downloads:show',
  downloadsCancel: 'downloads:cancel',
  downloadsTogglePause: 'downloads:toggle-pause',
  downloadsClear: 'downloads:clear',
  permissionsList: 'permissions:list',
  permissionsRespond: 'permissions:respond',
  // Renderer -> Main (invoke) — mémoire
  memoryGetStats: 'memory:get-stats',
  memorySearch: 'memory:search',
  memoryRecent: 'memory:recent',
  memoryDelete: 'memory:delete',
  // Renderer -> Main (send)
  layoutSetInsets: 'layout:set-insets',
  // Main -> Renderer (événements)
  tabsChanged: 'tabs:changed',
  memoryChanged: 'memory:changed',
  findResult: 'find:result',
  downloadsChanged: 'downloads:changed',
  downloadsStarted: 'downloads:started',
  permissionsChanged: 'permissions:changed',
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
    zoom(direction: 'in' | 'out' | 'reset'): Promise<void>
    /** Retourne une fonction de désabonnement. */
    onChanged(listener: (snapshot: TabsSnapshot) => void): () => void
  }
  find: {
    /** Recherche dans l'onglet actif. `findNext` = passer à l'occurrence suivante du même texte. */
    start(text: string, forward: boolean, findNext: boolean): Promise<void>
    stop(): Promise<void>
    onResult(listener: (result: FindResult) => void): () => void
  }
  downloads: {
    list(): Promise<DownloadState[]>
    open(id: number): Promise<void>
    showInFolder(id: number): Promise<void>
    cancel(id: number): Promise<void>
    togglePause(id: number): Promise<void>
    clearFinished(): Promise<void>
    onChanged(listener: (downloads: DownloadState[]) => void): () => void
    onStarted(listener: () => void): () => void
  }
  permissions: {
    list(): Promise<PermissionPrompt[]>
    respond(id: number, allow: boolean, remember: boolean): Promise<void>
    onChanged(listener: (prompts: PermissionPrompt[]) => void): () => void
  }
  memory: {
    getStats(): Promise<MemoryStats>
    search(query: string): Promise<MemorySearchResponse>
    recent(limit?: number): Promise<MemorySearchResult[]>
    /** « Oublier » une page : texte, vecteurs, visites et capture sont supprimés. */
    deletePage(pageId: number): Promise<boolean>
    /** Une page a été ajoutée, vectorisée ou supprimée. */
    onChanged(listener: () => void): () => void
  }
  ui: {
    onCommand(listener: (command: UiCommand) => void): () => void
  }
  layout: {
    setChromeInsets(insets: ChromeInsets): void
  }
}
