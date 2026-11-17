import { join } from 'node:path'
import { BrowserWindow, shell, type Rectangle } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { ChromeInsets, UiCommand } from '@shared/types'
import { DEFAULT_CHROME_TOP, DEFAULT_HOME_URL, isDev } from '../config'
import { attachShortcuts, type ShortcutAction } from '../shortcuts'
import { TabManager } from '../tabs/TabManager'

/**
 * Fenêtre principale :
 * - son webContents affiche l'UI React (onglets, barre d'adresse, plus tard sidebar) ;
 * - le TabManager superpose les WebContentsView des onglets dans la zone libre sous l'UI.
 */
export class MainWindow {
  readonly window: BrowserWindow
  readonly tabs: TabManager
  private insets: ChromeInsets = { top: DEFAULT_CHROME_TOP, right: 0 }

  constructor() {
    this.window = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 640,
      minHeight: 400,
      show: false,
      backgroundColor: '#0f1115',
      title: 'Second Cerveau',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false
      }
    })

    this.tabs = new TabManager(this.window, () => this.viewBounds())
    this.bindTabs()
    this.hardenUiContents()
    attachShortcuts(this.uiContents, (action) => this.runShortcut(action))

    this.window.once('ready-to-show', () => this.window.show())
    const relayout = () => this.tabs.layout()
    this.window.on('resize', relayout)
    this.window.on('maximize', relayout)
    this.window.on('unmaximize', relayout)
    this.window.on('enter-full-screen', relayout)
    this.window.on('leave-full-screen', relayout)
    this.window.on('closed', () => this.tabs.destroyAll())

    this.loadUi()
    this.tabs.create({ url: DEFAULT_HOME_URL })
  }

  get uiContents() {
    return this.window.webContents
  }

  /** Appelé par l'UI (via IPC) quand la hauteur de la barre ou la largeur de la sidebar change. */
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
    }
  }

  private bindTabs(): void {
    this.tabs.on('changed', (snapshot) => {
      if (this.uiContents.isDestroyed()) return
      this.uiContents.send(IpcChannels.tabsChanged, snapshot)
      const active = snapshot.tabs.find((t) => t.id === snapshot.activeTabId)
      this.window.setTitle(active?.title ? `${active.title} — Second Cerveau` : 'Second Cerveau')
    })
    this.tabs.on('focus-address-bar', () => this.sendUiCommand('focus-address-bar'))
    this.tabs.on('tab-created', (tab) => {
      attachShortcuts(tab.webContents, (action) => this.runShortcut(action))
    })
  }

  private sendUiCommand(command: UiCommand): void {
    if (this.uiContents.isDestroyed()) return
    this.uiContents.focus()
    this.uiContents.send(IpcChannels.uiCommand, command)
  }

  private viewBounds(): Rectangle {
    const [width, height] = this.window.getContentSize()
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
