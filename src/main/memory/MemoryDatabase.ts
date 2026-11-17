import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { getLoadablePath } from 'sqlite-vec'
import type { EmbeddingJob, IngestResult, MemoryWorkerApi, PageCapture } from '../workers/types'
import { chunkText } from './chunking'
import { hybridSearch, recentPages, type PageHit, type SearchParams } from './hybridSearch'
import { EMBEDDING_DIMS, MAX_TEXT_LENGTH, RECAPTURE_AFTER_MS, VISIT_DEDUP_MS } from './config'
import { MIGRATIONS } from './schema'

interface PageRow {
  id: number
  title: string
  content_hash: string
  captured_at: number
  last_visited_at: number
  screenshot_file: string | null
}

type Stats = ReturnType<MemoryWorkerApi['stats']>

/**
 * Accès SQLite (module natif `node:sqlite` intégré à Electron) + sqlite-vec.
 * Utilisé exclusivement depuis le worker mémoire : un seul écrivain, jamais sur le thread principal.
 */
export class MemoryDatabase {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path, { allowExtension: true })
    this.db.loadExtension(unpackedPath(getLoadablePath()))
    this.db.enableLoadExtension(false)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `)
    this.migrate()
  }

  close(): void {
    if (this.db.isOpen) this.db.close()
  }

  shouldCapture(url: string, now: number): boolean {
    const row = this.db.prepare('SELECT captured_at FROM pages WHERE url = ?').get(url) as
      | { captured_at: number }
      | undefined
    return !row || now - row.captured_at > RECAPTURE_AFTER_MS
  }

  /** Note une visite sans recapturer. Retourne false si la page est inconnue. */
  recordVisit(url: string, visitedAt: number): boolean {
    const page = this.db.prepare('SELECT id, last_visited_at FROM pages WHERE url = ?').get(url) as
      | Pick<PageRow, 'id' | 'last_visited_at'>
      | undefined
    if (!page) return false
    this.transaction(() => this.touchVisit(page.id, page.last_visited_at, visitedAt))
    return true
  }

  /**
   * Enregistre (ou met à jour) une page. Les chunks sont recalculés seulement si le texte a changé.
   * La capture d'écran est écrite par l'appelant à partir de `pageId`.
   */
  ingest(capture: PageCapture, screenshotFile: (pageId: number) => string | null): IngestResult {
    const { url, visitedAt, content } = capture
    const text = content.text.slice(0, MAX_TEXT_LENGTH)
    const hash = createHash('sha256').update(text).digest('hex')

    return this.transaction(() => {
      const existing = this.db
        .prepare('SELECT id, title, content_hash, captured_at, last_visited_at, screenshot_file FROM pages WHERE url = ?')
        .get(url) as PageRow | undefined

      let pageId: number
      if (existing) {
        pageId = existing.id
        this.db
          .prepare(
            `UPDATE pages SET title = ?, site_name = ?, byline = ?, excerpt = ?, lang = ?,
               content = ?, content_hash = ?, captured_at = ? WHERE id = ?`
          )
          .run(content.title, content.siteName, content.byline, content.excerpt, content.lang, text, hash, visitedAt, pageId)
        this.touchVisit(pageId, existing.last_visited_at, visitedAt)
      } else {
        const res = this.db
          .prepare(
            `INSERT INTO pages (url, title, site_name, byline, excerpt, lang, content, content_hash,
               first_visited_at, last_visited_at, captured_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(url, content.title, content.siteName, content.byline, content.excerpt, content.lang, text, hash, visitedAt, visitedAt, visitedAt)
        pageId = Number(res.lastInsertRowid)
        this.db.prepare('INSERT INTO visits (page_id, visited_at) VALUES (?, ?)').run(pageId, visitedAt)
      }

      const file = screenshotFile(pageId)
      if (file) this.db.prepare('UPDATE pages SET screenshot_file = ? WHERE id = ?').run(file, pageId)

      if (existing && existing.content_hash === hash) {
        return { pageId, isNew: false, embeddingJob: null }
      }

      this.deleteChunks(pageId)
      const insertChunk = this.db.prepare('INSERT INTO chunks (page_id, ord, text) VALUES (?, ?, ?)')
      const chunks = chunkText(text).map((chunkTextValue, ord) => ({
        id: Number(insertChunk.run(pageId, ord, chunkTextValue).lastInsertRowid),
        text: chunkTextValue
      }))
      this.db
        .prepare("UPDATE pages SET embedding_status = 'pending', embedding_model = NULL WHERE id = ?")
        .run(pageId)

      return { pageId, isNew: !existing, embeddingJob: { pageId, title: content.title, chunks } }
    })
  }

  pendingEmbeddingJobs(limit: number): EmbeddingJob[] {
    const pages = this.db
      .prepare("SELECT id, title FROM pages WHERE embedding_status = 'pending' ORDER BY last_visited_at DESC LIMIT ?")
      .all(limit) as { id: number; title: string }[]
    const chunksOf = this.db.prepare('SELECT id, text FROM chunks WHERE page_id = ? ORDER BY ord')
    return pages.map((p) => ({
      pageId: p.id,
      title: p.title,
      chunks: chunksOf.all(p.id) as { id: number; text: string }[]
    }))
  }

  storeEmbeddings(pageId: number, model: string, chunkIds: number[], vectors: Float32Array): void {
    if (vectors.length !== chunkIds.length * EMBEDDING_DIMS) {
      throw new Error(`dimensions inattendues : ${vectors.length} pour ${chunkIds.length} chunks`)
    }
    this.transaction(() => {
      // Les chunks ont pu être remplacés entre-temps (page recapturée) : on ignore les orphelins.
      const exists = this.db.prepare('SELECT 1 FROM chunks WHERE id = ? AND page_id = ?')
      const del = this.db.prepare('DELETE FROM chunk_vectors WHERE chunk_id = ?')
      const ins = this.db.prepare('INSERT INTO chunk_vectors (chunk_id, embedding) VALUES (?, ?)')
      let stored = 0
      chunkIds.forEach((chunkId, i) => {
        if (!exists.get(chunkId, pageId)) return
        del.run(BigInt(chunkId))
        ins.run(BigInt(chunkId), vectors.subarray(i * EMBEDDING_DIMS, (i + 1) * EMBEDDING_DIMS))
        stored++
      })
      if (stored > 0 || chunkIds.length === 0) {
        this.db
          .prepare("UPDATE pages SET embedding_status = 'done', embedding_model = ? WHERE id = ?")
          .run(model, pageId)
      }
    })
  }

  search(params: SearchParams): PageHit[] {
    return hybridSearch(this.db, params)
  }

  recent(range: { from: number; to: number } | null, limit: number): PageHit[] {
    return recentPages(this.db, range, limit)
  }

  /** « Oublier » une page : tout est supprimé. Retourne le fichier de capture à effacer. */
  deletePage(pageId: number): { screenshotFile: string | null } | null {
    return this.transaction(() => {
      const page = this.db.prepare('SELECT screenshot_file FROM pages WHERE id = ?').get(pageId) as
        | { screenshot_file: string | null }
        | undefined
      if (!page) return null
      this.deleteChunks(pageId)
      this.db.prepare('DELETE FROM pages WHERE id = ?').run(pageId) // visites : ON DELETE CASCADE
      return { screenshotFile: page.screenshot_file }
    })
  }

  markEmbeddingError(pageId: number): void {
    this.db.prepare("UPDATE pages SET embedding_status = 'error' WHERE id = ?").run(pageId)
  }

  stats(): Stats {
    const count = (sql: string) => Number((this.db.prepare(sql).get() as { n: number | bigint }).n)
    return {
      pages: count('SELECT COUNT(*) AS n FROM pages'),
      visits: count('SELECT COUNT(*) AS n FROM visits'),
      chunks: count('SELECT COUNT(*) AS n FROM chunks'),
      embeddedChunks: count('SELECT COUNT(*) AS n FROM chunk_vectors'),
      pendingPages: count("SELECT COUNT(*) AS n FROM pages WHERE embedding_status = 'pending'")
    }
  }

  private touchVisit(pageId: number, lastVisitedAt: number, visitedAt: number): void {
    if (visitedAt - lastVisitedAt < VISIT_DEDUP_MS) {
      this.db.prepare('UPDATE pages SET last_visited_at = MAX(last_visited_at, ?) WHERE id = ?').run(visitedAt, pageId)
      return
    }
    this.db
      .prepare('UPDATE pages SET last_visited_at = ?, visit_count = visit_count + 1 WHERE id = ?')
      .run(visitedAt, pageId)
    this.db.prepare('INSERT INTO visits (page_id, visited_at) VALUES (?, ?)').run(pageId, visitedAt)
  }

  private deleteChunks(pageId: number): void {
    this.db
      .prepare('DELETE FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM chunks WHERE page_id = ?)')
      .run(pageId)
    this.db.prepare('DELETE FROM chunks WHERE page_id = ?').run(pageId)
  }

  private migrate(): void {
    const { user_version: version } = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.transaction(() => {
        this.db.exec(MIGRATIONS[v])
        this.db.exec(`PRAGMA user_version = ${v + 1}`)
      })
    }
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }
}

/** Dans une app packagée, l'extension native doit être lue hors de l'archive asar. */
function unpackedPath(path: string): string {
  return path.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}
