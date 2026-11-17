import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels, type BrowserApi } from '@shared/ipc'
import type { NavigationState } from '@shared/types'

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
    stop: () => ipcRenderer.invoke(IpcChannels.navStop),
    getState: () => ipcRenderer.invoke(IpcChannels.navGetState),
    onStateChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, state: NavigationState) => listener(state)
      ipcRenderer.on(IpcChannels.navStateChanged, handler)
      return () => ipcRenderer.removeListener(IpcChannels.navStateChanged, handler)
    }
  },
  layout: {
    setChromeInsets: (insets) => ipcRenderer.send(IpcChannels.layoutSetInsets, insets)
  }
}

contextBridge.exposeInMainWorld('api', api)
