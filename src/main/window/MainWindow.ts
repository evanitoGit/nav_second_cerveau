import { join } from 'node:path'
import { app, BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { ChromeInsets, UiCommand } from '@shared/types'
import { CaptureService } from '../capture/CaptureService'
import { DEFAULT_CHROME_TOP, isDev } from '../config'
import type { DownloadManager } from '../downloads/DownloadManager'
import type { MemoryService } from '../memory/MemoryService'
import type { PermissionManager } from '../permissions/PermissionManager'
import type { SavedSession, SessionStore } from '../session/SessionStore'
import { settings } from '../settings'
import { attachShortcuts, type ShortcutAction } from '../shortcuts'
import { attachPageContextMenu, attachUiContextMenu } from '../tabs/contextMenu'
import { TabManager } from '../tabs/TabManager'

export interface MainWindowServices {
  memory: MemoryService
  downloads: DownloadManager
  permissions: PermissionManager
  session: SessionStore
}

/**
 * Fenêtre principale :
 * - son webContents affiche l'UI React (onglets, barre d'adresse, panneaux) ;
 * - le TabManager superpose les WebContentsView des onglets dans la zone libre sous l'UI.
 */
export class MainWindow {
  readonly window: BrowserWindow
  readonly tabs: TabManager
  private readonly capture: CaptureService
  private insets: ChromeInsets = { top: DEFAULT_CHROME_TOP, right: 0 }
  /** Une page (vidéo…) est en plein écran : elle occupe toute la fenêtre. */
  private htmlFullscreen = false
  private readonly cleanups: (() => void)[] = []

  constructor(private readonly services: MainWindowServices) {
    const saved = settings().get().restoreSession ? services.session.load() : null
    const bounds = restorableBounds(saved?.window?.bounds)

    this.window = new BrowserWindow({
      ...(bounds ?? { width: 1280, height: 820 }),
      minWidth: 640,
      minHeight: 400,
      show: false,
      backgroundColor: '#0f1115',
      title: 'Second Cerveau',
      // Windows prend l'icône de l'exécutable ; Linux a besoin qu'on la fournisse à la fenêtre.
      icon: process.platform === 'linux' ? windowIcon() : undefined,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false
      }
    })
    if (saved?.window?.maximized) this.window.maximize()

    this.tabs = new TabManager(this.window, () => this.viewBounds())
    this.capture = new CaptureService(services.memory, this.window, this.tabs)
    this.bindTabs()
    this.bindServices()
    this.hardenUiContents()
    attachShortcuts(this.uiContents, (action) => this.runShortcut(action))
    attachUiContextMenu(this.uiContents, this.window)

    this.window.once('ready-to-show', () => this.window.show())
    const relayout = () => this.tabs.layout()
    for (const evt of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const) {
      this.window.on(evt as 'resize', relayout)
    }
    this.window.on('resized', () => this.saveSession())
    this.window.on('moved', () => this.saveSession())
    this.window.on('close', () => services.session.flush(this.sessionSnapshot()))
    this.window.on('closed', () => {
      for (const cleanup of this.cleanups) cleanup()
      this.capture.dispose()
      this.tabs.destroyAll()
    })

    this.loadUi()
    this.restoreTabs(saved)
  }

  get uiContents() {
    return this.window.webContents
  }

  /** Appelé par l'UI (via IPC) quand la hauteur de la barre ou la largeur d'un panneau change. */
  setChromeInsets(insets: ChromeInsets): void {
    this.insets = insets
    this.tabs.layout()
  }

  runShortcut(action: ShortcutAction): void {
    const tab = this.tabs.active
    switch (action.type) {
      case 'new-tab':
        return void this.tabs.create()
      case 'new-private-tab':
        return void this.tabs.create({ isPrivate: true })
      case 'close-tab':
        return this.tabs.closeActive()
      case 'reopen-closed-tab':
        return this.tabs.reopenClosed()
      case 'next-tab':
        return this.tabs.activateRelative(1)
      case 'previous-tab':
        return this.tabs.activateRelative(-1)
      case 'select-tab':
        return this.tabs.activateIndex(action.index)
      case 'focus-address-bar':
        return this.sendUiCommand('focus-address-bar')
      case 'reload':
        return tab?.reload()
      case 'hard-reload':
        return tab?.webContents.reloadIgnoringCache()
      case 'back':
        return tab?.back()
      case 'forward':
        return tab?.forward()
      case 'toggle-devtools':
        return tab?.webContents.toggleDevTools()
      case 'toggle-memory':
        return this.sendUiCommand('toggle-memory')
      case 'find':
        return this.sendUiCommand('open-find')
      case 'zoom':
        return tab?.zoom(action.direction)
      case 'print':
        return tab?.webContents.print()
      case 'toggle-downloads':
        return this.sendUiCommand('toggle-downloads')
      case 'toggle-settings':
        return this.sendUiCommand('toggle-settings')
    }
  }

  private restoreTabs(saved: SavedSession | null): void {
    if (!saved || saved.tabs.length === 0) {
      this.tabs.create({ url: settings().get().homeUrl })
      return
    }
    const active = Math.min(Math.max(0, saved.activeIndex), saved.tabs.length - 1)
    const created = saved.tabs.map((t) => this.tabs.create({ deferred: t, activate: false }))
    this.tabs.activate(created[active].id)
  }

  private sessionSnapshot(): SavedSession {
    const all = this.tabs.all.filter((t) => !t.isPrivate)
    const tabs = all
      .map((t) => t.getState())
      .filter((s) => /^https?:\/\//.test(s.url))
      .map((s) => ({ url: s.url, title: s.title }))
    const activeId = this.tabs.active?.id
    const activeIndex = Math.max(0, all.findIndex((t) => t.id === activeId))
    const win = this.window.isDestroyed()
      ? undefined
      : { bounds: this.window.getNormalBounds(), maximized: this.window.isMaximized() }
    return { tabs, activeIndex, window: win }
  }

  private saveSession(): void {
    if (!this.window.isDestroyed()) this.services.session.save(this.sessionSnapshot())
  }

  private bindTabs(): void {
    this.tabs.on('changed', (snapshot) => {
      if (this.uiContents.isDestroyed()) return
      this.uiContents.send(IpcChannels.tabsChanged, snapshot)
      const active = snapshot.tabs.find((t) => t.id === snapshot.activeTabId)
      this.window.setTitle(active?.title ? `${active.title} — Second Cerveau` : 'Second Cerveau')
      this.saveSession()
    })
    this.tabs.on('focus-address-bar', () => this.sendUiCommand('focus-address-bar'))
    this.tabs.on('activated', () => {
      if (this.htmlFullscreen) this.setHtmlFullscreen(false)
    })
    this.tabs.on('tab-created', (tab) => {
      attachShortcuts(tab.webContents, (action) => this.runShortcut(action))
      attachPageContextMenu(tab.webContents, this.window, tab.isPrivate, {
        openInNewTab: (url, { background, isPrivate }) =>
          this.tabs.create({ url, activate: !background, isPrivate: isPrivate ?? tab.isPrivate, openerId: isPrivate ? undefined : tab.id }),
        searchWeb: (text) =>
          this.tabs.create({ url: settings().searchUrl + encodeURIComponent(text), openerId: tab.id }),
        print: () => tab.webContents.print()
      })
      tab.on('found-in-page', (result) => this.send(IpcChannels.findResult, result))
      tab.on('html-fullscreen', (on) => {
        if (tab === this.tabs.active) this.setHtmlFullscreen(on)
      })
    })
  }

  private bindServices(): void {
    const { memory, downloads, permissions } = this.services
    const relay = <T extends unknown[]>(channel: string) => (...args: T) => this.send(channel, ...args)
    const onMemory = relay(IpcChannels.memoryChanged)
    const onDownloads = relay(IpcChannels.downloadsChanged)
    const onDownloadStarted = relay(IpcChannels.downloadsStarted)
    const onPermissions = relay(IpcChannels.permissionsChanged)
    const onSettings = relay(IpcChannels.settingsChanged)
    settings().on('changed', onSettings)
    this.cleanups.push(() => settings().off('changed', onSettings))
    memory.on('changed', onMemory)
    downloads.on('changed', onDownloads)
    downloads.on('started', onDownloadStarted)
    permissions.on('changed', onPermissions)
    this.cleanups.push(
      () => memory.off('changed', onMemory),
      () => downloads.off('changed', onDownloads),
      () => downloads.off('started', onDownloadStarted),
      () => permissions.off('changed', onPermissions)
    )
  }

  /** Plein écran d'une page : la fenêtre passe en plein écran et la page masque l'UI. */
  private setHtmlFullscreen(on: boolean): void {
    this.htmlFullscreen = on
    this.window.setFullScreen(on)
    this.tabs.layout()
  }

  private send(channel: string, ...args: unknown[]): void {
    if (!this.uiContents.isDestroyed()) this.uiContents.send(channel, ...args)
  }

  private sendUiCommand(command: UiCommand): void {
    if (this.uiContents.isDestroyed()) return
    this.uiContents.focus()
    this.uiContents.send(IpcChannels.uiCommand, command)
  }

  private viewBounds(): Rectangle {
    const [width, height] = this.window.getContentSize()
    if (this.htmlFullscreen) return { x: 0, y: 0, width, height }
    const top = Math.min(this.insets.top, height)
    const right = Math.min(this.insets.right, width)
    return { x: 0, y: top, width: Math.max(0, width - right), height: Math.max(0, height - top) }
  }

  private loadUi(): void {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (isDev && devUrl) {
      void this.window.loadURL(devUrl)
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  /** L'UI du navigateur ne doit jamais naviguer ailleurs ni ouvrir de fenêtres. */
  private hardenUiContents(): void {
    const ui = this.uiContents
    ui.on('will-navigate', (e) => e.preventDefault())
    ui.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  }
}

function windowIcon(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build/icon.png')
}

/** Position sauvegardée, seulement si elle est encore visible sur un écran branché. */
function restorableBounds(bounds: Rectangle | undefined): Rectangle | null {
  if (!bounds || bounds.width < 400 || bounds.height < 300) return null
  const area = screen.getDisplayMatching(bounds).workArea
  const visible =
    bounds.x < area.x + area.width - 100 &&
    bounds.x + bounds.width > area.x + 100 &&
    bounds.y >= area.y - 20 &&
    bounds.y < area.y + area.height - 100
  return visible ? bounds : null
}
