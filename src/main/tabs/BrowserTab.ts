import { EventEmitter } from 'node:events'
import { WebContentsView, type Rectangle } from 'electron'
import type { TabState } from '@shared/types'
import { isSafeWebUrl, normalizeAddressInput } from '@shared/url'
import { BROWSING_PARTITION, PRIVATE_PARTITION } from '../config'

export type OpenDisposition = 'foreground' | 'background'

interface BrowserTabEvents {
  /** L'état affichable (titre, URL, chargement…) a changé. */
  'state-changed': []
  /** La page demande l'ouverture d'une URL dans un nouvel onglet (target=_blank, Ctrl+clic…). */
  'open-url': [url: string, disposition: OpenDisposition]
}

let nextTabId = 1

/**
 * Un onglet = une WebContentsView isolée (sandbox, sans Node, sans preload pour l'instant).
 * La classe encapsule la navigation ; le TabManager écoute ses événements.
 */
export class BrowserTab extends EventEmitter<BrowserTabEvents> {
  readonly id = nextTabId++
  readonly isPrivate: boolean
  readonly view: WebContentsView
  private title = 'Nouvel onglet'
  private favicon: string | null = null
  /** Vrai dès qu'une navigation a été demandée, même si la page n'a pas encore d'URL. */
  private navigationRequested = false

  constructor(options: { isPrivate?: boolean } = {}) {
    super()
    this.isPrivate = options.isPrivate ?? false
    this.view = new WebContentsView({
      webPreferences: {
        partition: this.isPrivate ? PRIVATE_PARTITION : BROWSING_PARTITION,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false
      }
    })
    this.view.setBackgroundColor('#ffffff')
    this.view.setVisible(false)
    this.bindEvents()
  }

  get webContents() {
    return this.view.webContents
  }

  /** Nouvel onglet vide (aucune navigation demandée) : la barre d'adresse doit prendre le focus. */
  get isBlank(): boolean {
    const url = this.webContents.getURL()
    return !this.navigationRequested && (url === '' || url === 'about:blank')
  }

  async navigate(input: string): Promise<void> {
    const url = normalizeAddressInput(input)
    if (!isSafeWebUrl(url)) return
    this.navigationRequested = true
    try {
      await this.webContents.loadURL(url)
    } catch (err) {
      // ERR_ABORTED (-3) survient quand une navigation en remplace une autre : normal.
      if (!isAbortError(err)) console.warn(`[tab ${this.id}] échec de chargement`, url, err)
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

  setVisible(visible: boolean): void {
    this.view.setVisible(visible)
  }

  getState(): TabState {
    const wc = this.webContents
    return {
      id: this.id,
      isPrivate: this.isPrivate,
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
    if (!this.webContents.isDestroyed()) this.emit('state-changed')
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
      this.favicon = favicons.find((f) => /^(https?|data):/.test(f)) ?? null
      this.emitState()
    })
    wc.on('render-process-gone', (_e, details) => {
      console.warn(`[tab ${this.id}] processus de rendu terminé :`, details.reason)
      this.title = 'Page plantée — actualiser'
      this.emitState()
    })

    // Bloque les schémas dangereux (file:, javascript:, chrome:…) dans les pages.
    wc.on('will-navigate', (e, url) => {
      if (!isSafeWebUrl(url)) e.preventDefault()
    })

    // Jamais de fenêtre native : toute ouverture devient un onglet géré par le TabManager.
    // (window.opener n'est donc pas conservé, ce qui est aussi plus sûr.)
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (isSafeWebUrl(url) && url !== 'about:blank') {
        this.emit('open-url', url, disposition === 'background-tab' ? 'background' : 'foreground')
      }
      return { action: 'deny' }
    })
  }
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { errno?: number }).errno === -3
}
