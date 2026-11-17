import { EventEmitter } from 'node:events'
import { WebContentsView, type Rectangle } from 'electron'
import type { NavigationState } from '@shared/types'
import { isSafeWebUrl, normalizeAddressInput } from '@shared/url'
import { BROWSING_PARTITION } from '../config'

interface BrowserTabEvents {
  'state-changed': [NavigationState]
}

/**
 * Un onglet = une WebContentsView isolée (sandbox, sans Node, sans preload pour l'instant).
 * La classe encapsule la navigation et publie un `NavigationState` à chaque changement.
 * Elle sera réutilisée telle quelle par le TabManager à l'étape multi-onglets.
 */
export class BrowserTab extends EventEmitter<BrowserTabEvents> {
  readonly view: WebContentsView
  private title = 'Nouvel onglet'
  private favicon: string | null = null

  constructor() {
    super()
    this.view = new WebContentsView({
      webPreferences: {
        partition: BROWSING_PARTITION,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false
      }
    })
    this.view.setBackgroundColor('#ffffff')
    this.bindEvents()
  }

  get webContents() {
    return this.view.webContents
  }

  async navigate(input: string): Promise<void> {
    const url = normalizeAddressInput(input)
    if (!isSafeWebUrl(url)) return
    try {
      await this.webContents.loadURL(url)
    } catch (err) {
      // ERR_ABORTED (-3) survient quand une navigation en remplace une autre : normal.
      if (!isAbortError(err)) console.warn('[BrowserTab] échec de chargement', url, err)
    }
  }

  back(): void {
    if (this.webContents.navigationHistory.canGoBack()) this.webContents.navigationHistory.goBack()
  }

  forward(): void {
    if (this.webContents.navigationHistory.canGoForward()) this.webContents.navigationHistory.goForward()
  }

  reload(): void {
    this.webContents.reload()
  }

  stop(): void {
    this.webContents.stop()
  }

  setBounds(bounds: Rectangle): void {
    this.view.setBounds(bounds)
  }

  getState(): NavigationState {
    const wc = this.webContents
    return {
      url: wc.getURL(),
      title: this.title,
      favicon: this.favicon,
      isLoading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward()
    }
  }

  destroy(): void {
    this.removeAllListeners()
    if (!this.webContents.isDestroyed()) this.webContents.close()
  }

  private emitState = (): void => {
    if (this.webContents.isDestroyed()) return
    this.emit('state-changed', this.getState())
  }

  private bindEvents(): void {
    const wc = this.webContents

    wc.on('did-start-loading', this.emitState)
    wc.on('did-stop-loading', this.emitState)
    wc.on('did-navigate', () => {
      this.favicon = null
      this.emitState()
    })
    wc.on('did-navigate-in-page', this.emitState)
    wc.on('page-title-updated', (_e, title) => {
      this.title = title || wc.getURL()
      this.emitState()
    })
    wc.on('page-favicon-updated', (_e, favicons) => {
      this.favicon = favicons[0] ?? null
      this.emitState()
    })

    // Bloque les schémas dangereux (file:, javascript:, chrome:…) dans les pages.
    wc.on('will-navigate', (e, url) => {
      if (!isSafeWebUrl(url)) e.preventDefault()
    })

    // Pas de popups natives : en attendant le multi-onglets, on ouvre dans l'onglet courant.
    wc.setWindowOpenHandler(({ url }) => {
      if (isSafeWebUrl(url)) void this.navigate(url)
      return { action: 'deny' }
    })
  }
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { errno?: number }).errno === -3
}
