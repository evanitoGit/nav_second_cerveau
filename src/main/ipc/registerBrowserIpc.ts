import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { ChromeInsets, TabsSnapshot } from '@shared/types'
import type { DownloadManager } from '../downloads/DownloadManager'
import type { MemoryService } from '../memory/MemoryService'
import type { PermissionManager } from '../permissions/PermissionManager'
import type { MainWindow } from '../window/MainWindow'

const EMPTY_SNAPSHOT: TabsSnapshot = { tabs: [], activeTabId: null }

/**
 * Handlers IPC de navigation et d'onglets.
 * Chaque message est vérifié : il doit provenir du webContents de l'UI (jamais d'une page web),
 * et ses arguments sont validés avant usage.
 */
export interface IpcServices {
  memory: MemoryService
  downloads: DownloadManager
  permissions: PermissionManager
}

export function registerBrowserIpc(getWindow: () => MainWindow | null, services: IpcServices): void {
  const { memory, downloads, permissions } = services
  const fromUi = (event: IpcMainInvokeEvent | IpcMainEvent): MainWindow | null => {
    const win = getWindow()
    if (!win || event.sender !== win.uiContents) return null
    return win
  }
  const activeTab = (event: IpcMainInvokeEvent) => fromUi(event)?.tabs.active ?? null

  // --- Navigation (onglet actif) ---
  ipcMain.handle(IpcChannels.navNavigate, async (event, input: unknown) => {
    if (typeof input !== 'string' || input.length > 8192) return
    await activeTab(event)?.navigate(input)
  })
  ipcMain.handle(IpcChannels.navBack, (event) => activeTab(event)?.back())
  ipcMain.handle(IpcChannels.navForward, (event) => activeTab(event)?.forward())
  ipcMain.handle(IpcChannels.navReload, (event) => activeTab(event)?.reload())
  ipcMain.handle(IpcChannels.navStop, (event) => activeTab(event)?.stop())

  // --- Onglets ---
  ipcMain.handle(IpcChannels.tabsGetSnapshot, (event): TabsSnapshot => {
    return fromUi(event)?.tabs.getSnapshot() ?? EMPTY_SNAPSHOT
  })

  ipcMain.handle(IpcChannels.tabsCreate, (event, options: unknown) => {
    const win = fromUi(event)
    if (!win) return
    const opts = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {}
    const url = typeof opts.url === 'string' && opts.url.length <= 8192 ? opts.url : undefined
    win.tabs.create({ url, isPrivate: opts.isPrivate === true, activate: opts.activate !== false })
  })

  ipcMain.handle(IpcChannels.tabsClose, (event, tabId: unknown) => {
    if (isInt(tabId, 1)) fromUi(event)?.tabs.close(tabId)
  })

  ipcMain.handle(IpcChannels.tabsActivate, (event, tabId: unknown) => {
    if (isInt(tabId, 1)) fromUi(event)?.tabs.activate(tabId)
  })

  ipcMain.handle(IpcChannels.tabsMove, (event, tabId: unknown, toIndex: unknown) => {
    if (isInt(tabId, 1) && isInt(toIndex, 0)) fromUi(event)?.tabs.move(tabId, toIndex)
  })

  ipcMain.handle(IpcChannels.tabsZoom, (event, direction: unknown) => {
    if (direction === 'in' || direction === 'out' || direction === 'reset') activeTab(event)?.zoom(direction)
  })

  // --- Recherche dans la page ---
  ipcMain.handle(IpcChannels.findStart, (event, text: unknown, forward: unknown, findNext: unknown) => {
    if (typeof text !== 'string' || text.length > 1000) return
    activeTab(event)?.find(text, forward !== false, findNext === true)
  })
  ipcMain.handle(IpcChannels.findStop, (event) => activeTab(event)?.stopFind())

  // --- Téléchargements ---
  const withId = (fn: (id: number) => void) => (event: IpcMainInvokeEvent, id: unknown) => {
    if (fromUi(event) && isInt(id, 1)) fn(id)
  }
  ipcMain.handle(IpcChannels.downloadsList, (event) => (fromUi(event) ? downloads.list() : []))
  ipcMain.handle(IpcChannels.downloadsOpen, withId((id) => downloads.open(id)))
  ipcMain.handle(IpcChannels.downloadsShow, withId((id) => downloads.showInFolder(id)))
  ipcMain.handle(IpcChannels.downloadsCancel, withId((id) => downloads.cancel(id)))
  ipcMain.handle(IpcChannels.downloadsTogglePause, withId((id) => downloads.togglePause(id)))
  ipcMain.handle(IpcChannels.downloadsClear, (event) => {
    if (fromUi(event)) downloads.clearFinished()
  })

  // --- Autorisations ---
  ipcMain.handle(IpcChannels.permissionsList, (event) => (fromUi(event) ? permissions.list() : []))
  ipcMain.handle(IpcChannels.permissionsRespond, (event, id: unknown, allow: unknown, remember: unknown) => {
    if (fromUi(event) && isInt(id, 1)) permissions.respond(id, allow === true, remember === true)
  })

  // --- Mémoire ---
  const requireUi = (event: IpcMainInvokeEvent) => {
    if (!fromUi(event)) throw new Error('expéditeur non autorisé')
  }
  ipcMain.handle(IpcChannels.memoryGetStats, (event) => {
    requireUi(event)
    return memory.stats()
  })
  ipcMain.handle(IpcChannels.memorySearch, (event, query: unknown) => {
    requireUi(event)
    if (typeof query !== 'string') throw new Error('requête invalide')
    return memory.search(query.slice(0, 500))
  })
  ipcMain.handle(IpcChannels.memoryRecent, (event, limit: unknown) => {
    requireUi(event)
    return memory.recent(isInt(limit, 1) ? Math.min(limit, 100) : 20)
  })
  ipcMain.handle(IpcChannels.memoryDelete, (event, pageId: unknown) => {
    requireUi(event)
    return isInt(pageId, 1) ? memory.deletePage(pageId) : false
  })

  // --- Mise en page ---
  ipcMain.on(IpcChannels.layoutSetInsets, (event, insets: unknown) => {
    const win = fromUi(event)
    if (!win || !isChromeInsets(insets)) return
    win.setChromeInsets({ top: Math.round(insets.top), right: Math.round(insets.right) })
  })
}

function isInt(value: unknown, min: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) < 1_000_000
}

function isChromeInsets(value: unknown): value is ChromeInsets {
  if (typeof value !== 'object' || value === null) return false
  const { top, right } = value as Record<string, unknown>
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 10_000
  return ok(top) && ok(right)
}
