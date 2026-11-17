import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { ChromeInsets, NavigationState } from '@shared/types'
import type { MainWindow } from '../window/MainWindow'

const EMPTY_STATE: NavigationState = {
  url: '',
  title: '',
  favicon: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false
}

/**
 * Enregistre les handlers IPC de navigation.
 * Chaque message est vérifié : il doit provenir du webContents de l'UI (jamais d'une page web).
 */
export function registerNavigationIpc(getWindow: () => MainWindow | null): void {
  const fromUi = (event: IpcMainInvokeEvent | IpcMainEvent): MainWindow | null => {
    const win = getWindow()
    if (!win || event.sender !== win.uiContents) return null
    return win
  }

  ipcMain.handle(IpcChannels.navNavigate, async (event, input: unknown) => {
    const win = fromUi(event)
    if (!win || typeof input !== 'string' || input.length > 8192) return
    await win.tab?.navigate(input)
  })

  ipcMain.handle(IpcChannels.navBack, (event) => fromUi(event)?.tab?.back())
  ipcMain.handle(IpcChannels.navForward, (event) => fromUi(event)?.tab?.forward())
  ipcMain.handle(IpcChannels.navReload, (event) => fromUi(event)?.tab?.reload())
  ipcMain.handle(IpcChannels.navStop, (event) => fromUi(event)?.tab?.stop())

  ipcMain.handle(IpcChannels.navGetState, (event): NavigationState => {
    return fromUi(event)?.tab?.getState() ?? EMPTY_STATE
  })

  ipcMain.on(IpcChannels.layoutSetInsets, (event, insets: unknown) => {
    const win = fromUi(event)
    if (!win || !isChromeInsets(insets)) return
    win.setChromeInsets({ top: Math.round(insets.top), right: Math.round(insets.right) })
  })
}

function isChromeInsets(value: unknown): value is ChromeInsets {
  if (typeof value !== 'object' || value === null) return false
  const { top, right } = value as Record<string, unknown>
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 10_000
  return ok(top) && ok(right)
}
