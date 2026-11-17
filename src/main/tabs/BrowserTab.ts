import { EventEmitter } from 'node:events'
import { WebContentsView, type Rectangle } from 'electron'
import type { MemoryCaptureStatus } from '@shared/memory'
import type { FindResult, TabState } from '@shared/types'
import { isSafeWebUrl, normalizeAddressInput } from '@shared/url'
import { BROWSING_PARTITION, PRIVATE_PARTITION } from '../config'

export type OpenDisposition = 'foreground' | 'background'

interface BrowserTabEvents {
  /** L'état affichable (titre, URL, chargement…) a changé. */
  'state-changed': []
  /** La page demande l'ouverture d'une URL dans un nouvel onglet (target=_blank, Ctrl+clic…). */
  'open-url': [url: string, disposition: OpenDisposition]
  /** Une nouvelle URL est affichée dans le cadre principal (navigation classique ou SPA). */
  'url-committed': [url: string]
  'found-in-page': [FindResult]
  /** La page passe en plein écran (vidéo…) ou en sort. */
  'html-fullscreen': [boolean]
}

/** Paliers de zoom (identiques à Chrome). */
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

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
  private memoryStatus: MemoryCaptureStatus = 'idle'
  private loadError: TabState['error'] = null
  private active = false
  /** Onglet restauré pas encore chargé : URL et titre affichés en attendant l'activation. */
  private deferred: { url: string; title: string } | null = null

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

  get error(): TabState['error'] {
    return this.loadError
  }

  /** Onglet restauré : il ne sera chargé qu'à sa première activation (démarrage rapide). */
  setDeferred(url: string, title: string): void {
    this.deferred = { url, title }
    this.navigationRequested = true
  }

  async navigate(input: string): Promise<void> {
    const url = normalizeAddressInput(input)
    if (!isSafeWebUrl(url)) return
    this.navigationRequested = true
    this.deferred = null
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
    // Après un échec, on relance l'URL demandée (la page d'erreur n'est pas rechargeable telle quelle).
    if (this.loadError) void this.navigate(this.loadError.url)
    else this.webContents.reload()
  }

  zoom(direction: 'in' | 'out' | 'reset'): void {
    const current = this.webContents.getZoomFactor()
    let next = 1
    if (direction === 'in') next = ZOOM_STEPS.find((z) => z > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
    if (direction === 'out') next = [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? ZOOM_STEPS[0]
    // Chromium applique le zoom à toute l'origine (et le mémorise pour la prochaine visite).
    this.webContents.setZoomFactor(next)
    this.emitState()
  }

  find(text: string, forward: boolean, findNext: boolean): void {
    if (!text) return this.stopFind()
    this.webContents.findInPage(text, { forward, findNext, matchCase: false })
  }

  stopFind(): void {
    if (!this.webContents.isDestroyed()) this.webContents.stopFindInPage('clearSelection')
  }

  /** Appelé par le TabManager : onglet affiché ou non. */
  setActive(active: boolean): void {
    this.active = active
    if (active && this.deferred) void this.navigate(this.deferred.url)
    this.updateVisibility()
  }

  /** En cas d'erreur, la vue est masquée : l'UI affiche sa propre page d'erreur dessous. */
  private updateVisibility(): void {
    this.view.setVisible(this.active && !this.loadError)
  }

  stop(): void {
    this.webContents.stop()
  }

  setBounds(bounds: Rectangle): void {
    this.view.setBounds(bounds)
  }

  get memory(): MemoryCaptureStatus {
    return this.memoryStatus
  }

  setMemoryStatus(status: MemoryCaptureStatus): void {
    if (status === this.memoryStatus) return
    this.memoryStatus = status
    this.emitState()
  }

  getState(): TabState {
    const wc = this.webContents
    return {
      id: this.id,
      isPrivate: this.isPrivate,
      url: this.deferred?.url ?? this.loadError?.url ?? wc.getURL(),
      title: this.deferred?.title ?? this.title,
      favicon: this.favicon,
      isLoading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      memory: this.memoryStatus,
      zoomFactor: Math.round(wc.getZoomFactor() * 100) / 100,
      error: this.loadError
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
    wc.on('did-navigate', (_e, url) => {
      this.favicon = null
      this.emitState()
      this.emit('url-committed', url)
    })
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      this.emitState()
      if (isMainFrame) this.emit('url-committed', url)
    })
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

    wc.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument || !this.loadError) return
      this.loadError = null
      this.updateVisibility()
      this.emitState()
    })
    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // -3 = navigation annulée (remplacée par une autre) : pas une erreur pour l'utilisateur.
      if (!isMainFrame || errorCode === -3) return
      this.loadError = { code: errorCode, description: errorDescription, url: validatedURL }
      this.title = hostOf(validatedURL)
      this.updateVisibility()
      this.emitState()
    })
    wc.on('found-in-page', (_e, result) => {
      this.emit('found-in-page', { tabId: this.id, activeMatch: result.activeMatchOrdinal, matches: result.matches })
    })
    // Ctrl+molette : Electron signale l'intention, c'est à nous d'appliquer le zoom.
    wc.on('zoom-changed', (_e, direction) => this.zoom(direction))
    wc.on('enter-html-full-screen', () => this.emit('html-fullscreen', true))
    wc.on('leave-html-full-screen', () => this.emit('html-fullscreen', false))

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

function hostOf(url: string): string {
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { errno?: number }).errno === -3
}
