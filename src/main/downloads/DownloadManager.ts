import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync } from 'node:fs'
import { join, parse } from 'node:path'
import { app, shell, type DownloadItem, type Session } from 'electron'
import type { DownloadState } from '@shared/types'

const MAX_ENTRIES = 50
const PROGRESS_THROTTLE_MS = 300

/**
 * Téléchargements : enregistrés directement dans le dossier Téléchargements (comme Chrome),
 * avec un nom unique. La liste est tenue pour la session en cours et affichée dans l'UI.
 */
export class DownloadManager extends EventEmitter<{ changed: [DownloadState[]]; started: [] }> {
  private readonly entries = new Map<number, { item: DownloadItem | null; state: DownloadState }>()
  private nextId = 1
  private throttle: NodeJS.Timeout | null = null
  /** Chemins déjà attribués mais pas encore créés sur le disque. */
  private readonly reserved = new Set<string>()

  watch(ses: Session): void {
    ses.on('will-download', (_event, item) => this.track(item))
  }

  list(): DownloadState[] {
    return [...this.entries.values()].map((e) => ({ ...e.state })).sort((a, b) => b.startedAt - a.startedAt)
  }

  open(id: number): void {
    const entry = this.entries.get(id)
    if (entry?.state.status === 'completed') void shell.openPath(entry.state.path)
  }

  showInFolder(id: number): void {
    const entry = this.entries.get(id)
    if (entry && existsSync(entry.state.path)) shell.showItemInFolder(entry.state.path)
  }

  cancel(id: number): void {
    this.entries.get(id)?.item?.cancel()
  }

  togglePause(id: number): void {
    const item = this.entries.get(id)?.item
    if (!item) return
    if (item.isPaused()) {
      if (item.canResume()) item.resume()
    } else item.pause()
    this.update(id)
  }

  /** Retire de la liste les téléchargements terminés (les fichiers restent sur le disque). */
  clearFinished(): void {
    for (const [id, e] of this.entries) if (e.state.status !== 'progressing' && e.state.status !== 'paused') this.entries.delete(id)
    this.emitNow()
  }

  private track(item: DownloadItem): void {
    const id = this.nextId++
    const path = this.uniquePath(item.getFilename() || 'telechargement')
    item.setSavePath(path)
    this.reserved.add(path)

    this.entries.set(id, {
      item,
      state: {
        id,
        filename: parse(path).base,
        path,
        url: item.getURL(),
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        status: 'progressing',
        startedAt: Date.now()
      }
    })
    this.trim()

    item.on('updated', () => this.update(id, true))
    item.once('done', (_e, state) => {
      this.reserved.delete(path)
      const entry = this.entries.get(id)
      if (entry) {
        entry.state.status = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted'
        entry.state.receivedBytes = item.getReceivedBytes()
        entry.item = null
      }
      if (state === 'completed' && process.platform === 'win32') app.addRecentDocument(path)
      this.emitNow()
    })
    this.emit('started')
    this.emitNow()
  }

  private update(id: number, throttled = false): void {
    const entry = this.entries.get(id)
    const item = entry?.item
    if (!entry || !item) return
    entry.state.receivedBytes = item.getReceivedBytes()
    entry.state.totalBytes = item.getTotalBytes()
    entry.state.status = item.isPaused() ? 'paused' : 'progressing'
    if (!throttled) return this.emitNow()
    this.throttle ??= setTimeout(() => this.emitNow(), PROGRESS_THROTTLE_MS)
  }

  private emitNow(): void {
    if (this.throttle) clearTimeout(this.throttle)
    this.throttle = null
    this.emit('changed', this.list())
  }

  private uniquePath(filename: string): string {
    const dir = app.getPath('downloads')
    mkdirSync(dir, { recursive: true })
    const safe = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 200) || 'telechargement'
    const { name, ext } = parse(safe)
    let candidate = join(dir, safe)
    for (let n = 1; existsSync(candidate) || this.reserved.has(candidate); n++) {
      candidate = join(dir, `${name} (${n})${ext}`)
    }
    return candidate
  }

  private trim(): void {
    if (this.entries.size <= MAX_ENTRIES) return
    for (const [id, e] of this.entries) {
      if (this.entries.size <= MAX_ENTRIES) break
      if (!e.item) this.entries.delete(id)
    }
  }
}
