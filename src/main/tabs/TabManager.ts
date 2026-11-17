import { EventEmitter } from 'node:events'
import { session, type BrowserWindow, type Rectangle } from 'electron'
import type { TabsSnapshot } from '@shared/types'
import { CLOSED_TABS_HISTORY, PRIVATE_PARTITION } from '../config'
import { BrowserTab } from './BrowserTab'

export interface CreateTabParams {
  url?: string
  isPrivate?: boolean
  /** false = onglet ouvert en arrière-plan (Ctrl+clic, clic molette). */
  activate?: boolean
  /** Onglet à l'origine de l'ouverture : le nouvel onglet est inséré juste après lui. */
  openerId?: number
  /** Onglet restauré : chargé seulement à sa première activation. */
  deferred?: { url: string; title: string }
}

interface TabManagerEvents {
  /** Instantané complet, émis au plus une fois par tour de boucle d'événements. */
  changed: [TabsSnapshot]
  /** L'onglet actif est vierge : l'UI doit donner le focus à la barre d'adresse. */
  'focus-address-bar': []
  /** Nouvel onglet créé (pour brancher les raccourcis clavier, la capture…). */
  'tab-created': [BrowserTab]
  /** L'onglet actif a changé. */
  activated: [tab: BrowserTab, previous: BrowserTab | null]
  /** Onglet fermé (émis juste avant sa destruction). */
  'tab-closed': [BrowserTab]
}

interface ClosedTab {
  url: string
  index: number
}

/**
 * Possède toutes les WebContentsView d'une fenêtre. Toutes restent attachées à la fenêtre ;
 * seule celle de l'onglet actif est visible (setVisible), ce qui rend le changement d'onglet instantané.
 */
export class TabManager extends EventEmitter<TabManagerEvents> {
  private readonly tabs: BrowserTab[] = []
  private readonly openers = new Map<number, number>()
  private readonly closed: ClosedTab[] = []
  private activeId: number | null = null
  private emitScheduled = false

  constructor(
    private readonly window: BrowserWindow,
    private readonly getViewBounds: () => Rectangle
  ) {
    super()
  }

  get active(): BrowserTab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null
  }

  get(id: number): BrowserTab | undefined {
    return this.tabs.find((t) => t.id === id)
  }

  get all(): readonly BrowserTab[] {
    return this.tabs
  }

  create(params: CreateTabParams = {}): BrowserTab {
    const opener = params.openerId !== undefined ? this.get(params.openerId) : undefined
    // Un onglet ouvert depuis un onglet privé reste privé.
    const tab = new BrowserTab({ isPrivate: params.isPrivate ?? opener?.isPrivate ?? false })

    this.tabs.splice(this.insertionIndex(opener), 0, tab)
    if (opener) this.openers.set(tab.id, opener.id)

    this.window.contentView.addChildView(tab.view)
    tab.setBounds(this.getViewBounds())

    tab.on('state-changed', () => this.scheduleEmit())
    tab.on('open-url', (url, disposition) =>
      this.create({ url, openerId: tab.id, activate: disposition === 'foreground' })
    )
    this.emit('tab-created', tab)

    if (params.deferred) tab.setDeferred(params.deferred.url, params.deferred.title)
    else if (params.url) void tab.navigate(params.url)
    if (params.activate !== false || this.activeId === null) this.activate(tab.id)
    else this.scheduleEmit()
    return tab
  }

  close(id: number): void {
    const index = this.tabs.findIndex((t) => t.id === id)
    if (index === -1) return
    const tab = this.tabs[index]

    const closedUrl = tab.webContents.getURL()
    if (!tab.isPrivate && closedUrl && closedUrl !== 'about:blank') {
      this.closed.push({ url: closedUrl, index })
      if (this.closed.length > CLOSED_TABS_HISTORY) this.closed.shift()
    }

    // Choix du prochain onglet actif : l'onglet d'origine s'il existe, sinon le voisin de droite, sinon de gauche.
    if (id === this.activeId) {
      const openerId = this.openers.get(id)
      const next =
        (openerId !== undefined ? this.get(openerId) : undefined) ??
        this.tabs[index + 1] ??
        this.tabs[index - 1] ??
        null
      this.activeId = null
      if (next) this.activate(next.id)
    }

    this.tabs.splice(index, 1)
    this.openers.delete(id)
    for (const [child, parent] of this.openers) if (parent === id) this.openers.delete(child)
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(tab.view)
    this.emit('tab-closed', tab)
    tab.destroy()

    if (tab.isPrivate && !this.tabs.some((t) => t.isPrivate)) void clearPrivateSession()

    // On garde toujours au moins un onglet ouvert.
    if (this.tabs.length === 0) this.create()
    else this.scheduleEmit()
  }

  closeActive(): void {
    if (this.activeId !== null) this.close(this.activeId)
  }

  reopenClosed(): void {
    const last = this.closed.pop()
    if (!last) return
    const tab = this.create({ url: last.url, activate: true })
    this.move(tab.id, last.index)
  }

  activate(id: number): void {
    const tab = this.get(id)
    if (!tab) return
    const previous = this.active
    this.activeId = id

    tab.setBounds(this.getViewBounds())
    tab.setActive(true)
    if (previous && previous !== tab) {
      previous.setActive(false)
      previous.stopFind()
    }

    if (tab.isBlank) this.emit('focus-address-bar')
    else tab.webContents.focus()
    if (previous !== tab) this.emit('activated', tab, previous)
    this.scheduleEmit()
  }

  /** delta = +1 onglet suivant, -1 précédent (boucle aux extrémités). */
  activateRelative(delta: number): void {
    if (this.tabs.length < 2) return
    const index = this.tabs.findIndex((t) => t.id === this.activeId)
    const next = (index + delta + this.tabs.length) % this.tabs.length
    this.activate(this.tabs[next].id)
  }

  /** index = -1 pour le dernier onglet (Ctrl+9). */
  activateIndex(index: number): void {
    const tab = index < 0 ? this.tabs[this.tabs.length - 1] : this.tabs[index]
    if (tab) this.activate(tab.id)
  }

  move(id: number, toIndex: number): void {
    const from = this.tabs.findIndex((t) => t.id === id)
    if (from === -1) return
    const to = Math.max(0, Math.min(this.tabs.length - 1, Math.trunc(toIndex)))
    if (from === to) return
    const [tab] = this.tabs.splice(from, 1)
    this.tabs.splice(to, 0, tab)
    this.scheduleEmit()
  }

  /** Recalcule la taille de toutes les vues (les onglets masqués restent prêts à s'afficher). */
  layout(): void {
    const bounds = this.getViewBounds()
    for (const tab of this.tabs) tab.setBounds(bounds)
  }

  getSnapshot(): TabsSnapshot {
    return { tabs: this.tabs.map((t) => t.getState()), activeTabId: this.activeId }
  }

  destroyAll(): void {
    for (const tab of this.tabs.splice(0)) tab.destroy()
    this.openers.clear()
    this.activeId = null
    this.removeAllListeners()
  }

  /** Les onglets ouverts depuis un même onglet se rangent à sa droite, dans l'ordre d'ouverture. */
  private insertionIndex(opener: BrowserTab | undefined): number {
    if (!opener) return this.tabs.length
    let index = this.tabs.indexOf(opener) + 1
    while (index < this.tabs.length && this.openers.get(this.tabs[index].id) === opener.id) index++
    return index
  }

  private scheduleEmit(): void {
    if (this.emitScheduled) return
    this.emitScheduled = true
    setImmediate(() => {
      this.emitScheduled = false
      if (!this.window.isDestroyed()) this.emit('changed', this.getSnapshot())
    })
  }
}

/** Efface cookies, cache et stockage quand le dernier onglet privé est fermé. */
async function clearPrivateSession(): Promise<void> {
  const ses = session.fromPartition(PRIVATE_PARTITION)
  await Promise.all([ses.clearStorageData(), ses.clearCache(), ses.clearAuthCache()])
}
