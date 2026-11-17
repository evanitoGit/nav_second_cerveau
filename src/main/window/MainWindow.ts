import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { ChromeInsets } from '@shared/types'
import { DEFAULT_CHROME_TOP, DEFAULT_HOME_URL, isDev } from '../config'
import { BrowserTab } from '../tabs/BrowserTab'

/**
 * Fenêtre principale :
 * - son webContents affiche l'UI React (barre de navigation, plus tard onglets + sidebar) ;
 * - une WebContentsView (BrowserTab) est superposée dans la zone libre sous l'UI.
 */
export class MainWindow {
  readonly window: BrowserWindow
  private activeTab: BrowserTab | null = null
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
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false
      }
    })

    this.hardenUiContents()
    this.window.once('ready-to-show', () => this.window.show())

    const relayout = () => this.layout()
    this.window.on('resize', relayout)
    this.window.on('maximize', relayout)
    this.window.on('unmaximize', relayout)
    this.window.on('enter-full-screen', relayout)
    this.window.on('leave-full-screen', relayout)
    this.window.on('closed', () => {
      this.activeTab?.destroy()
      this.activeTab = null
    })

    this.loadUi()
    this.attachTab(new BrowserTab())
    void this.activeTab?.navigate(DEFAULT_HOME_URL)
  }

  get uiContents() {
    return this.window.webContents
  }

  get tab(): BrowserTab | null {
    return this.activeTab
  }

  /** Appelé par l'UI (via IPC) quand la hauteur de la barre ou la largeur de la sidebar change. */
  setChromeInsets(insets: ChromeInsets): void {
    this.insets = insets
    this.layout()
  }

  private attachTab(tab: BrowserTab): void {
    this.activeTab = tab
    this.window.contentView.addChildView(tab.view)
    tab.on('state-changed', (state) => {
      if (!this.uiContents.isDestroyed()) this.uiContents.send(IpcChannels.navStateChanged, state)
    })
    this.layout()
  }

  private layout(): void {
    if (!this.activeTab || this.window.isDestroyed()) return
    const [width, height] = this.window.getContentSize()
    const top = Math.min(this.insets.top, height)
    const right = Math.min(this.insets.right, width)
    this.activeTab.setBounds({
      x: 0,
      y: top,
      width: Math.max(0, width - right),
      height: Math.max(0, height - top)
    })
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
