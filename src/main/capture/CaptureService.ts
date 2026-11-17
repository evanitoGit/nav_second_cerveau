import type { BrowserWindow } from 'electron'
import type { BrowserTab } from '../tabs/BrowserTab'
import type { TabManager } from '../tabs/TabManager'
import type { MemoryService } from '../memory/MemoryService'
import { hostMatches } from '@shared/settings'
import { CAPTURE_EXCLUDED_HOSTS, DWELL_MS, MIN_TEXT_LENGTH } from '../memory/config'
import { settings } from '../settings'
import { extractContent } from './extractContent'
import { captureScreenshot } from './screenshot'

const LOAD_WAIT_MS = 10_000

/**
 * Déclenche la mémorisation d'une page quand l'utilisateur y reste DWELL_MS (5 s) :
 * onglet actif, fenêtre visible, page web non privée. Le compte à rebours repart à chaque
 * changement d'URL, d'onglet ou quand la fenêtre est réduite.
 *
 * Seules deux opérations ont lieu dans le Main : l'extraction du texte (exécutée dans la page)
 * et la capture d'écran (GPU). Encodage, écriture disque et IA se font dans les workers.
 */
export class CaptureService {
  private readonly timers = new Map<number, NodeJS.Timeout>()
  /** Dernière URL (sans #ancre) vue par onglet, et dernière URL mémorisée. */
  private readonly currentKey = new Map<number, string>()
  private readonly capturedKey = new Map<number, string>()
  /** Captures en cours (`tabId|url`), pour ne jamais lancer deux fois la même. */
  private readonly inFlight = new Set<string>()

  constructor(
    private readonly memory: MemoryService,
    private readonly window: BrowserWindow,
    private readonly tabs: TabManager
  ) {
    tabs.on('tab-created', (tab) => tab.on('url-committed', (url) => this.onUrlCommitted(tab, url)))
    tabs.on('activated', (tab, previous) => {
      if (previous) this.cancel(previous)
      this.schedule(tab)
    })
    tabs.on('tab-closed', (tab) => {
      this.cancel(tab)
      this.currentKey.delete(tab.id)
      this.capturedKey.delete(tab.id)
    })

    const pause = () => {
      const tab = this.tabs.active
      if (tab) this.cancel(tab)
    }
    const resume = () => {
      const tab = this.tabs.active
      if (tab) this.schedule(tab)
    }
    window.on('minimize', pause)
    window.on('hide', pause)
    window.on('restore', resume)
    window.on('show', resume)

    // Pause / reprise / nouvelle exclusion : on réévalue l'onglet actif immédiatement.
    this.onSettings = () => {
      const tab = this.tabs.active
      for (const t of this.tabs.all) if (t !== tab && (t.memory === 'paused' || t.memory === 'excluded')) t.setMemoryStatus('idle')
      if (tab) this.schedule(tab)
    }
    settings().on('changed', this.onSettings)
  }

  private readonly onSettings: () => void

  dispose(): void {
    settings().off('changed', this.onSettings)
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  private onUrlCommitted(tab: BrowserTab, url: string): void {
    const key = urlKey(url)
    if (key === this.currentKey.get(tab.id)) return // simple changement d'ancre
    this.currentKey.set(tab.id, key)
    this.capturedKey.delete(tab.id)
    this.cancel(tab)
    tab.setMemoryStatus('idle')
    if (tab === this.tabs.active) this.schedule(tab)
  }

  private schedule(tab: BrowserTab): void {
    this.cancel(tab)
    const key = urlKey(tab.webContents.getURL())
    if (!key || tab.error) return tab.setMemoryStatus('idle')
    if (tab.isPrivate || isBuiltinExcluded(key)) return tab.setMemoryStatus('skipped')
    const { enabled, excludedHosts } = settings().get().memory
    if (excludedHosts.some((h) => hostMatches(new URL(key).hostname, h))) return tab.setMemoryStatus('excluded')
    if (!enabled) return tab.setMemoryStatus('paused')
    if (this.capturedKey.get(tab.id) === key) return tab.setMemoryStatus('captured')
    if (this.inFlight.has(`${tab.id}|${key}`)) return
    if (this.window.isMinimized() || !this.window.isVisible()) return

    tab.setMemoryStatus('waiting')
    this.timers.set(
      tab.id,
      setTimeout(() => {
        this.timers.delete(tab.id)
        void this.capture(tab, key)
      }, DWELL_MS)
    )
  }

  private cancel(tab: BrowserTab): void {
    const timer = this.timers.get(tab.id)
    if (timer) clearTimeout(timer)
    this.timers.delete(tab.id)
    if (tab.memory === 'waiting') tab.setMemoryStatus('idle')
  }

  /** La page est-elle toujours celle pour laquelle le compte à rebours a été lancé ? */
  private stillCurrent(tab: BrowserTab, key: string): boolean {
    return (
      !tab.webContents.isDestroyed() &&
      tab === this.tabs.active &&
      !tab.error &&
      urlKey(tab.webContents.getURL()) === key &&
      !this.window.isMinimized()
    )
  }

  private async capture(tab: BrowserTab, key: string): Promise<void> {
    const flightId = `${tab.id}|${key}`
    if (this.inFlight.has(flightId)) return
    this.inFlight.add(flightId)
    try {
      await this.runCapture(tab, key)
    } finally {
      this.inFlight.delete(flightId)
    }
  }

  private async runCapture(tab: BrowserTab, key: string): Promise<void> {
    if (tab.webContents.isLoading()) await waitForLoad(tab)
    if (!this.stillCurrent(tab, key)) return tab.setMemoryStatus('idle')

    tab.setMemoryStatus('capturing')
    const setStatus = (status: 'captured' | 'skipped' | 'idle') => {
      if (!tab.webContents.isDestroyed() && urlKey(tab.webContents.getURL()) === key) tab.setMemoryStatus(status)
    }

    try {
      const visitedAt = Date.now()
      if (!(await this.memory.shouldCapture(key))) {
        await this.memory.recordVisit(key, visitedAt)
      } else {
        const content = await extractContent(tab.webContents)
        if (content.text.length < MIN_TEXT_LENGTH) return setStatus('skipped')
        // La capture d'écran n'a de sens que si la page est encore affichée.
        const screenshot = this.stillCurrent(tab, key)
          ? await captureScreenshot(tab.webContents, this.memory.canEncodeWebp).catch(() => null)
          : null
        await this.memory.ingest({ url: key, visitedAt, content, screenshot })
      }
      this.capturedKey.set(tab.id, key)
      setStatus('captured')
    } catch (err) {
      console.warn('[capture] échec pour', key, err)
      setStatus('idle')
    }
  }
}

/** URL sans l'ancre : deux ancres d'une même page = une seule page. */
function urlKey(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return ''
  }
}

function isBuiltinExcluded(key: string): boolean {
  const host = new URL(key).hostname
  return CAPTURE_EXCLUDED_HOSTS.some((h) => hostMatches(host, h))
}

function waitForLoad(tab: BrowserTab): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      if (!tab.webContents.isDestroyed()) tab.webContents.off('did-stop-loading', done)
      resolve()
    }
    const timer = setTimeout(done, LOAD_WAIT_MS)
    tab.webContents.once('did-stop-loading', done)
  })
}
