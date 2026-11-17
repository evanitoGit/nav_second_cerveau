import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { MemoryStats } from '@shared/memory'
import memoryWorkerPath from '../workers/memory.worker?modulePath'
import embeddingWorkerPath from '../workers/embedding.worker?modulePath'
import { WorkerClient } from '../workers/rpc'
import type { EmbeddingJob, EmbeddingWorkerApi, MemoryWorkerApi, PageCapture } from '../workers/types'
import { EMBEDDING_MODEL } from './config'

const RETRY_DELAY_MS = 60_000

/**
 * Façade du Main process vers la mémoire locale. Ne fait aucun travail lourd :
 * elle relaie vers le worker mémoire (SQLite, fichiers) et le worker d'embeddings (IA),
 * et ordonnance le calcul des embeddings en tâche de fond, une page à la fois.
 */
export class MemoryService {
  private readonly memory: WorkerClient<MemoryWorkerApi>
  private readonly embeddings: WorkerClient<EmbeddingWorkerApi>
  private readonly queue: EmbeddingJob[] = []
  private readonly queued = new Set<number>()
  private processing = false
  private retryTimer: NodeJS.Timeout | null = null
  private model: MemoryStats['embeddingModel'] = { id: EMBEDDING_MODEL, status: 'idle' }
  canEncodeWebp = true

  constructor(userDataDir: string) {
    const root = join(userDataDir, 'memory')
    const fake = process.env['SECOND_CERVEAU_FAKE_EMBEDDINGS'] === '1'
    if (fake) this.model.id = 'fake-hash-embeddings'

    this.memory = new WorkerClient(
      'memory.worker',
      () => new Worker(memoryWorkerPath),
      async (client) => {
        const { webp } = await client.callDuringStartup('init', {
          dbPath: join(root, 'memory.db'),
          screenshotsDir: join(root, 'screenshots')
        })
        this.canEncodeWebp = webp
      }
    )
    this.embeddings = new WorkerClient(
      'embedding.worker',
      () => new Worker(embeddingWorkerPath),
      (client) =>
        client.callDuringStartup('init', { modelId: EMBEDDING_MODEL, cacheDir: join(userDataDir, 'models'), fake })
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
    if (result.embeddingJob) this.enqueue(result.embeddingJob)
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
          vectors = texts.length
            ? (await this.embeddings.call('embed', { texts, kind: 'passage' })).vectors
            : new Float32Array(0)
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
