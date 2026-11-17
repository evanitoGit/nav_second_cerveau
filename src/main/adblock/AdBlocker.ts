import { EventEmitter } from 'node:events'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { ipcMain, net, type Session } from 'electron'

const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const COSMETIC_CHANNELS = ['@ghostery/adblocker/inject-cosmetic-filters', '@ghostery/adblocker/is-mutation-observer-enabled']

/**
 * Bloqueur de publicités et de traqueurs (moteur Ghostery, listes EasyList / EasyPrivacy…).
 * - filtrage réseau : requêtes vers les régies et traqueurs annulées ;
 * - filtrage cosmétique : emplacements publicitaires masqués (script injecté dans les pages).
 * Le moteur compilé est mis en cache sur disque et rafraîchi chaque semaine ; hors ligne,
 * l'ancien cache est utilisé.
 *
 * L'intégration fournie par la bibliothèque ne gère qu'une session ; on l'applique ici aux deux
 * (navigation normale et privée) en réutilisant ses gestionnaires.
 */
export class AdBlocker extends EventEmitter<{ blocked: [webContentsId: number] }> {
  private engine: ElectronBlocker | null = null
  private enabled = false
  private readonly preloads = new Map<Session, string>()
  private readonly preloadPath = createRequire(__filename).resolve('@ghostery/adblocker-electron-preload')

  constructor(
    private readonly cachePath: string,
    private readonly sessions: Session[]
  ) {
    super()
  }

  /** Charge le moteur (cache ou téléchargement) puis applique l'état demandé. */
  async init(enabled: boolean): Promise<void> {
    this.enabled = enabled
    try {
      this.engine = await this.loadEngine()
      this.engine.on('request-blocked', (request) => {
        if (request.tabId !== undefined) this.emit('blocked', request.tabId)
      })
      if (this.enabled) this.attach()
    } catch (err) {
      console.warn('[adblock] moteur indisponible :', err instanceof Error ? err.message : err)
    }
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return
    this.enabled = enabled
    if (!this.engine) return
    if (enabled) this.attach()
    else this.detach()
  }

  private attach(): void {
    const engine = this.engine!
    for (const ses of this.sessions) {
      ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, engine.onBeforeRequest)
      ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, engine.onHeadersReceived)
      if (!this.preloads.has(ses)) {
        this.preloads.set(ses, ses.registerPreloadScript({ type: 'frame', filePath: this.preloadPath }))
      }
    }
    for (const channel of COSMETIC_CHANNELS) ipcMain.removeHandler(channel)
    ipcMain.handle(COSMETIC_CHANNELS[0], engine.onInjectCosmeticFilters)
    ipcMain.handle(COSMETIC_CHANNELS[1], engine.onIsMutationObserverEnabled)
  }

  private detach(): void {
    for (const ses of this.sessions) {
      ses.webRequest.onBeforeRequest(null)
      ses.webRequest.onHeadersReceived(null)
      const id = this.preloads.get(ses)
      if (id) ses.unregisterPreloadScript(id)
      this.preloads.delete(ses)
    }
    for (const channel of COSMETIC_CHANNELS) ipcMain.removeHandler(channel)
  }

  private async loadEngine(): Promise<ElectronBlocker> {
    // Développement / tests hors ligne : liste de filtres locale.
    const localList = process.env['SECOND_CERVEAU_ADBLOCK_FILTERS']
    if (localList) return ElectronBlocker.parse(await readFile(localList, 'utf8'), { loadCosmeticFilters: true })

    const cached = await this.readCache()
    if (cached && Date.now() - cached.mtime < REFRESH_AFTER_MS) return cached.engine
    try {
      const fresh = await ElectronBlocker.fromPrebuiltAdsAndTracking((url: string) => net.fetch(url))
      await this.writeCache(fresh)
      return fresh
    } catch (err) {
      if (cached) return cached.engine // hors ligne : listes un peu anciennes plutôt que rien
      throw err
    }
  }

  private async readCache(): Promise<{ engine: ElectronBlocker; mtime: number } | null> {
    try {
      const [buf, info] = await Promise.all([readFile(this.cachePath), stat(this.cachePath)])
      return { engine: ElectronBlocker.deserialize(new Uint8Array(buf)), mtime: info.mtimeMs }
    } catch {
      return null
    }
  }

  private async writeCache(engine: ElectronBlocker): Promise<void> {
    const tmp = `${this.cachePath}.tmp`
    await writeFile(tmp, engine.serialize())
    await rename(tmp, this.cachePath)
  }
}
