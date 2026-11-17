import type { MemoryStats } from '@shared/memory'
import type { PageHit, SearchParams } from '../memory/hybridSearch'

export type { PageHit, SearchParams }

/** Contenu extrait d'une page par Readability. */
export interface ExtractedContent {
  title: string
  siteName: string | null
  byline: string | null
  excerpt: string | null
  lang: string | null
  text: string
}

/** Capture d'écran : pixels bruts BGRA (encodés en WebP par le worker) ou JPEG de secours. */
export type ScreenshotPayload =
  | { kind: 'bgra'; width: number; height: number; data: ArrayBuffer }
  | { kind: 'jpeg'; data: ArrayBuffer }

export interface PageCapture {
  url: string
  visitedAt: number
  content: ExtractedContent
  screenshot: ScreenshotPayload | null
}

export interface ChunkToEmbed {
  id: number
  text: string
}

export interface EmbeddingJob {
  pageId: number
  title: string
  chunks: ChunkToEmbed[]
}

export interface IngestResult {
  pageId: number
  isNew: boolean
  /** null si le texte n'a pas changé depuis la dernière capture (pas de recalcul d'embeddings). */
  embeddingJob: EmbeddingJob | null
}

/** API du worker mémoire (SQLite + fichiers). */
export interface MemoryWorkerApi {
  init(params: { dbPath: string; screenshotsDir: string }): { webp: boolean }
  /** Faut-il refaire une capture complète, ou seulement noter la visite ? */
  shouldCapture(params: { url: string; now: number }): { capture: boolean }
  recordVisit(params: { url: string; visitedAt: number }): { recorded: boolean }
  ingestPage(params: PageCapture): IngestResult
  /** Pages dont les embeddings restent à calculer (ex. application fermée en cours de route). */
  pendingEmbeddingJobs(params: { limit: number }): EmbeddingJob[]
  storeEmbeddings(params: { pageId: number; model: string; chunkIds: number[]; vectors: Float32Array }): void
  markEmbeddingError(params: { pageId: number }): void
  search(params: SearchParams): PageHit[]
  recent(params: { range: { from: number; to: number } | null; limit: number }): PageHit[]
  deletePage(params: { pageId: number }): { deleted: boolean }
  stats(params: void): Omit<MemoryStats, 'embeddingModel'>
  close(params: void): void
}

/** API du worker d'embeddings (Transformers.js / onnxruntime). */
export interface EmbeddingWorkerApi {
  init(params: { modelId: string; cacheDir: string; fake: boolean }): void
  /** Retourne les vecteurs concaténés (n × dims), normalisés. */
  embed(params: { texts: string[]; kind: 'query' | 'passage' }): { vectors: Float32Array; dims: number }
}
