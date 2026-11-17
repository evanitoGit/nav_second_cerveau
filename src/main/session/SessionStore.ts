import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import type { Rectangle } from 'electron'

export interface SavedSession {
  tabs: { url: string; title: string }[]
  activeIndex: number
  window?: { bounds: Rectangle; maximized: boolean }
}

/**
 * Sauvegarde des onglets et de la fenêtre pour les restaurer au prochain lancement.
 * Les onglets privés ne sont jamais enregistrés. Écritures asynchrones et regroupées,
 * sauf la dernière à la fermeture (synchrone, pour ne rien perdre).
 */
export class SessionStore {
  private pending: SavedSession | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly path: string) {}

  load(): SavedSession | null {
    try {
      const data = JSON.parse(readFileSync(this.path, 'utf8')) as SavedSession
      if (!Array.isArray(data.tabs)) return null
      data.tabs = data.tabs.filter((t) => typeof t?.url === 'string' && /^https?:\/\//.test(t.url)).slice(0, 100)
      return data
    } catch {
      return null
    }
  }

  save(session: SavedSession): void {
    this.pending = session
    this.timer ??= setTimeout(() => {
      this.timer = null
      const data = this.pending
      this.pending = null
      if (!data) return
      const tmp = `${this.path}.tmp`
      void writeFile(tmp, JSON.stringify(data))
        .then(() => rename(tmp, this.path))
        .catch((err) => console.warn('[session] sauvegarde impossible', err))
    }, 1000)
  }

  /** Écriture immédiate (fermeture de la fenêtre). */
  flush(session: SavedSession): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
    try {
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify(session))
      renameSync(tmp, this.path)
    } catch (err) {
      console.warn('[session] sauvegarde impossible', err)
    }
  }
}
