import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { MemorySearchResponse, MemorySearchResult, MemoryStats } from '@shared/memory'
import memoryWorkerPath from '../workers/memory.worker?modulePath'
import embeddingWorkerPath from '../workers/embedding.worker?modulePath'
import { WorkerClient } from '../workers/rpc'
import type { EmbeddingJob, EmbeddingWorkerApi, MemoryWorkerApi, PageCapture, PageHit } from '../workers/types'
import { EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL, QUERY_EMBEDDING_TIMEOUT_MS, SEARCH_RESULTS_LIMIT } from './config'
import { parseQuery } from './queryParser'

/** Schéma privé servant les miniatures à l'UI du navigateur (et à elle seule). */
export const SCREENSHOT_SCHEME = 'memory'

const RETRY_DELAY_MS = 60_000

/**
 * Façade du Main process vers la mémoire locale. Ne fait aucun travail lourd :
 * elle relaie vers le worker mémoire (SQLite, fichiers) et le worker d'embeddings (IA),
 * et ordonnance le calcul des embeddings en tâche de fond, une page à la fois.
 */
export class MemoryService extends EventEmitter<{ changed: [] }> {
  private readonly memory: WorkerClient<MemoryWorkerApi>
  private readonly embeddings: WorkerClient<EmbeddingWorkerApi>
  private readonly queue: EmbeddingJob[] = []
  private readonly queued = new Set<number>()
  private processing = false
  private retryTimer: NodeJS.Timeout | null = null
  private model: MemoryStats['embeddingModel'] = { id: EMBEDDING_MODEL, status: 'idle' }
  canEncodeWebp = true
  readonly screenshotsDir: string

  /** @param modelsDir cache du modèle d'embeddings (par défaut <userData>/models) */
  constructor(userDataDir: string, modelsDir = join(userDataDir, 'models')) {
    super()
    const root = join(userDataDir, 'memory')
    this.screenshotsDir = join(root, 'screenshots')
    const fake = process.env['SECOND_CERVEAU_FAKE_EMBEDDINGS'] === '1'
    if (fake) this.model.id = 'fake-hash-embeddings'

    this.memory = new WorkerClient(
      'memory.worker',
      () => new Worker(memoryWorkerPath),
      async (client) => {
        const { webp } = await client.callDuringStartup('init', {
          dbPath: join(root, 'memory.db'),
          screenshotsDir: this.screenshotsDir
        })
        this.canEncodeWebp = webp
      }
    )
    this.embeddings = new WorkerClient(
      'embedding.worker',
      () => new Worker(embeddingWorkerPath),
      (client) =>
        client.callDuringStartup('init', { modelId: EMBEDDING_MODEL, cacheDir: modelsDir, fake })
    )
  }

  /** Démarre le worker mémoire et reprend les embeddings laissés en suspens. */
  async start(): Promise<void> {
    await this.memory.call('stats', undefined)
    void this.resumePending()
  }

  shouldCapture(url: string): Promise<boolean> {
    return this.memory.call('shouldCapture', { url, now: Date.now() }).then((r) => r.capture)
  }

  recordVisit(url: string, visitedAt: number): Promise<boolean> {
    return this.memory.call('recordVisit', { url, visitedAt }).then((r) => r.recorded)
  }

  async ingest(capture: PageCapture): Promise<void> {
    const transfer = capture.screenshot ? [capture.screenshot.data] : []
    const result = await this.memory.call('ingestPage', capture, transfer)
    this.emit('changed')
    if (result.embeddingJob) this.enqueue(result.embeddingJob)
  }

  /**
   * Recherche en langage naturel : période extraite de la requête, puis recherche hybride
   * (mots-clés + sens). Si le modèle n'est pas prêt à temps, on se contente des mots-clés.
   */
  async search(query: string): Promise<MemorySearchResponse> {
    const started = performance.now()
    const parsed = parseQuery(query)
    const range = parsed.range
    const respond = (hits: PageHit[], semantic: MemorySearchResponse['semantic']): MemorySearchResponse => ({
      query,
      results: hits.map(toResult),
      range,
      semantic,
      tookMs: Math.round(performance.now() - started)
    })

    if (!parsed.text) {
      const hits = await this.memory.call('recent', { range, limit: SEARCH_RESULTS_LIMIT })
      return respond(range ? hits : [], 'not-needed')
    }

    let vector: Float32Array | null = null
    try {
      vector = await withTimeout(this.embedQuery(parsed.text), QUERY_EMBEDDING_TIMEOUT_MS)
    } catch (err) {
      console.warn('[memory] requête non vectorisée, mots-clés seuls :', err instanceof Error ? err.message : err)
    }

    const hits = await this.memory.call(
      'search',
      { fts: parsed.fts, vector, range, limit: SEARCH_RESULTS_LIMIT },
      vector ? [vector.buffer as ArrayBuffer] : []
    )
    return respond(hits, vector ? 'used' : 'unavailable')
  }

  async recent(limit: number): Promise<MemorySearchResult[]> {
    return (await this.memory.call('recent', { range: null, limit })).map(toResult)
  }

  async deletePage(pageId: number): Promise<boolean> {
    const { deleted } = await this.memory.call('deletePage', { pageId })
    const queued = this.queue.findIndex((j) => j.pageId === pageId)
    if (queued > 0) this.queue.splice(queued, 1) // l'index 0 est peut-être en cours de calcul
    if (deleted) this.emit('changed')
    return deleted
  }

  async deleteHost(host: string): Promise<number> {
    const { deleted } = await this.memory.call('deleteHost', { host })
    if (deleted) this.emit('changed')
    return deleted
  }

  async clearAll(): Promise<void> {
    this.queue.splice(1) // le lot en cours se terminera sur des chunks supprimés (ignorés)
    this.queued.clear()
    await this.memory.call('clearAll', undefined)
    this.emit('changed')
  }

  private async embedQuery(text: string): Promise<Float32Array> {
    if (this.model.status !== 'ready') this.model = { id: this.model.id, status: 'loading' }
    const { vectors } = await this.embeddings.call('embed', { texts: [text], kind: 'query' })
    this.model = { id: this.model.id, status: 'ready' }
    return vectors
  }

  async stats(): Promise<MemoryStats> {
    return { ...(await this.memory.call('stats', undefined)), embeddingModel: { ...this.model } }
  }

  async dispose(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    await this.memory.call('close', undefined).catch(() => undefined)
    await Promise.all([this.memory.dispose(), this.embeddings.dispose()])
  }

  // --- File d'attente des embeddings -------------------------------------------------

  private enqueue(job: EmbeddingJob): void {
    // Une version plus récente de la même page remplace l'ancienne.
    const existing = this.queue.findIndex((j) => j.pageId === job.pageId)
    if (existing !== -1) this.queue.splice(existing, 1)
    this.queue.push(job)
    this.queued.add(job.pageId)
    void this.processQueue()
  }

  private async resumePending(): Promise<void> {
    try {
      const jobs = await this.memory.call('pendingEmbeddingJobs', { limit: 200 })
      for (const job of jobs) if (!this.queued.has(job.pageId)) this.enqueue(job)
    } catch (err) {
      console.warn('[memory] reprise des embeddings impossible :', err)
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.retryTimer) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const job = this.queue[0]
        let vectors: Float32Array
        try {
          if (this.model.status !== 'ready') this.model = { id: this.model.id, status: 'loading' }
          const texts = job.chunks.map((c) => `${job.title}\n${c.text}`)
          // Lots séparés : une recherche de l'utilisateur peut s'intercaler entre deux lots.
          const parts: Float32Array[] = []
          for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
            const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE)
            parts.push((await this.embeddings.call('embed', { texts: batch, kind: 'passage' })).vectors)
          }
          vectors = concat(parts)
          this.model = { id: this.model.id, status: 'ready' }
        } catch (err) {
          // Modèle indisponible (hors ligne, téléchargement interrompu…) : la page reste « pending »
          // et on réessaie plus tard, sans perdre la file.
          const message = err instanceof Error ? err.message : String(err)
          this.model = { id: this.model.id, status: 'error', error: message }
          console.warn('[memory] embeddings indisponibles, nouvel essai dans 60 s :', message)
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null
            void this.processQueue()
          }, RETRY_DELAY_MS)
          return
        }

        this.queue.shift()
        this.queued.delete(job.pageId)
        try {
          await this.memory.call(
            'storeEmbeddings',
            { pageId: job.pageId, model: this.model.id, chunkIds: job.chunks.map((c) => c.id), vectors },
            [vectors.buffer as ArrayBuffer]
          )
          this.emit('changed')
        } catch (err) {
          console.error(`[memory] stockage des embeddings de la page ${job.pageId} impossible :`, err)
          await this.memory.call('markEmbeddingError', { pageId: job.pageId }).catch(() => undefined)
        }
      }
    } finally {
      this.processing = false
    }
  }
}

function toResult(hit: PageHit): MemorySearchResult {
  const { screenshotFile, ...rest } = hit
  return {
    ...rest,
    screenshotUrl: screenshotFile ? `${SCREENSHOT_SCHEME}://screenshots/${encodeURIComponent(screenshotFile)}` : null
  }
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`délai de ${ms} ms dépassé`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}
