import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels, type BrowserApi } from '@shared/ipc'

/** Abonnement à un événement Main -> Renderer, avec fonction de désabonnement. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

/**
 * Pont IPC minimal et typé. Le Renderer n'a jamais accès à `ipcRenderer` directement :
 * il ne voit que les fonctions ci-dessous, exposées sous `window.api`.
 */
const api: BrowserApi = {
  navigation: {
    navigate: (input) => ipcRenderer.invoke(IpcChannels.navNavigate, input),
    back: () => ipcRenderer.invoke(IpcChannels.navBack),
    forward: () => ipcRenderer.invoke(IpcChannels.navForward),
    reload: () => ipcRenderer.invoke(IpcChannels.navReload),
    stop: () => ipcRenderer.invoke(IpcChannels.navStop)
  },
  tabs: {
    getSnapshot: () => ipcRenderer.invoke(IpcChannels.tabsGetSnapshot),
    create: (options) => ipcRenderer.invoke(IpcChannels.tabsCreate, options),
    close: (tabId) => ipcRenderer.invoke(IpcChannels.tabsClose, tabId),
    activate: (tabId) => ipcRenderer.invoke(IpcChannels.tabsActivate, tabId),
    move: (tabId, toIndex) => ipcRenderer.invoke(IpcChannels.tabsMove, tabId, toIndex),
    zoom: (direction) => ipcRenderer.invoke(IpcChannels.tabsZoom, direction),
    onChanged: (listener) => subscribe(IpcChannels.tabsChanged, listener)
  },
  find: {
    start: (text, forward, findNext) => ipcRenderer.invoke(IpcChannels.findStart, text, forward, findNext),
    stop: () => ipcRenderer.invoke(IpcChannels.findStop),
    onResult: (listener) => subscribe(IpcChannels.findResult, listener)
  },
  downloads: {
    list: () => ipcRenderer.invoke(IpcChannels.downloadsList),
    open: (id) => ipcRenderer.invoke(IpcChannels.downloadsOpen, id),
    showInFolder: (id) => ipcRenderer.invoke(IpcChannels.downloadsShow, id),
    cancel: (id) => ipcRenderer.invoke(IpcChannels.downloadsCancel, id),
    togglePause: (id) => ipcRenderer.invoke(IpcChannels.downloadsTogglePause, id),
    clearFinished: () => ipcRenderer.invoke(IpcChannels.downloadsClear),
    onChanged: (listener) => subscribe(IpcChannels.downloadsChanged, listener),
    onStarted: (listener) => subscribe(IpcChannels.downloadsStarted, () => listener())
  },
  permissions: {
    list: () => ipcRenderer.invoke(IpcChannels.permissionsList),
    respond: (id, allow, remember) => ipcRenderer.invoke(IpcChannels.permissionsRespond, id, allow, remember),
    onChanged: (listener) => subscribe(IpcChannels.permissionsChanged, listener)
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    update: (patch) => ipcRenderer.invoke(IpcChannels.settingsUpdate, patch),
    onChanged: (listener) => subscribe(IpcChannels.settingsChanged, listener)
  },
  privacy: {
    savedPermissions: () => ipcRenderer.invoke(IpcChannels.permissionsSaved),
    revokePermissions: (origin) => ipcRenderer.invoke(IpcChannels.permissionsRevoke, origin),
    clearBrowsingData: () => ipcRenderer.invoke(IpcChannels.browsingClearData)
  },
  app: {
    info: () => ipcRenderer.invoke(IpcChannels.appInfo),
    checkForUpdates: () => ipcRenderer.invoke(IpcChannels.appCheckUpdates)
  },
  memory: {
    getStats: () => ipcRenderer.invoke(IpcChannels.memoryGetStats),
    clearAll: () => ipcRenderer.invoke(IpcChannels.memoryClearAll),
    forgetHost: (host) => ipcRenderer.invoke(IpcChannels.memoryForgetHost, host),
    showIndicatorMenu: (tabId) => ipcRenderer.invoke(IpcChannels.memoryIndicatorMenu, tabId),
    search: (query) => ipcRenderer.invoke(IpcChannels.memorySearch, query),
    recent: (limit) => ipcRenderer.invoke(IpcChannels.memoryRecent, limit),
    deletePage: (pageId) => ipcRenderer.invoke(IpcChannels.memoryDelete, pageId),
    onChanged: (listener) => subscribe(IpcChannels.memoryChanged, () => listener())
  },
  ui: {
    onCommand: (listener) => subscribe(IpcChannels.uiCommand, listener)
  },
  layout: {
    setChromeInsets: (insets) => ipcRenderer.send(IpcChannels.layoutSetInsets, insets)
  }
}

contextBridge.exposeInMainWorld('api', api)
