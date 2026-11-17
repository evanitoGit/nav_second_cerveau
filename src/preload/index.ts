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
    onChanged: (listener) => subscribe(IpcChannels.tabsChanged, listener)
  },
  memory: {
    getStats: () => ipcRenderer.invoke(IpcChannels.memoryGetStats)
  },
  ui: {
    onCommand: (listener) => subscribe(IpcChannels.uiCommand, listener)
  },
  layout: {
    setChromeInsets: (insets) => ipcRenderer.send(IpcChannels.layoutSetInsets, insets)
  }
}

contextBridge.exposeInMainWorld('api', api)
