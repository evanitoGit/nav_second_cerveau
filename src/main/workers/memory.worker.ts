/**
 * Worker « mémoire » : seul propriétaire de la base SQLite et des fichiers de captures.
 * Tout ce qui touche au disque se passe ici, jamais sur le thread principal d'Electron.
 */
import { mkdirSync } from 'node:fs'
import { readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MemoryDatabase } from '../memory/MemoryDatabase'
import { SCREENSHOT_QUALITY, SCREENSHOT_WIDTH } from '../memory/config'
import { serve } from './rpc'
import type { MemoryWorkerApi, ScreenshotPayload } from './types'

type Sharp = (typeof import('sharp'))['default']

let db: MemoryDatabase | null = null
let screenshotsDir = ''
let sharp: Sharp | null = null

function database(): MemoryDatabase {
  if (!db) throw new Error('worker mémoire non initialisé')
  return db
}

/** Encode la capture en WebP (sharp). Retourne null si l'encodage échoue. */
async function encodeScreenshot(shot: ScreenshotPayload): Promise<{ bytes: Buffer; ext: string } | null> {
  if (shot.kind === 'jpeg') return { bytes: Buffer.from(shot.data), ext: 'jpg' }
  if (!sharp) return null
  const pixels = new Uint8Array(shot.data)
  // Chromium fournit du BGRA ; sharp attend du RGBA.
  for (let i = 0; i < pixels.length; i += 4) {
    const b = pixels[i]
    pixels[i] = pixels[i + 2]
    pixels[i + 2] = b
  }
  const bytes = await sharp(pixels, { raw: { width: shot.width, height: shot.height, channels: 4 } })
    .resize({ width: SCREENSHOT_WIDTH, withoutEnlargement: true })
    .webp({ quality: SCREENSHOT_QUALITY, effort: 4 })
    .toBuffer()
  return { bytes, ext: 'webp' }
}

/** Écriture atomique : fichier temporaire puis renommage. */
async function writeAtomic(path: string, bytes: Buffer): Promise<void> {
  const tmp = `${path}.tmp`
  await writeFile(tmp, bytes)
  await rename(tmp, path)
}

serve<MemoryWorkerApi>({
  async init({ dbPath, screenshotsDir: dir }) {
    mkdirSync(dir, { recursive: true })
    screenshotsDir = dir
    db = new MemoryDatabase(dbPath)
    try {
      sharp = (await import('sharp')).default
    } catch (err) {
      console.warn('[memory.worker] sharp indisponible, captures en JPEG :', err)
      sharp = null
    }
    return { webp: sharp !== null }
  },

  shouldCapture: ({ url, now }) => ({ capture: database().shouldCapture(url, now) }),

  recordVisit: ({ url, visitedAt }) => ({ recorded: database().recordVisit(url, visitedAt) }),

  async ingestPage(capture) {
    let encoded: Awaited<ReturnType<typeof encodeScreenshot>> = null
    if (capture.screenshot) {
      try {
        encoded = await encodeScreenshot(capture.screenshot)
      } catch (err) {
        console.warn('[memory.worker] échec encodage capture :', err)
      }
    }

    let fileName: string | null = null
    const result = database().ingest({ ...capture, screenshot: null }, (pageId) => {
      fileName = encoded ? `${pageId}.${encoded.ext}` : null
      return fileName
    })
    if (encoded && fileName) await writeAtomic(join(screenshotsDir, fileName), encoded.bytes)
    return result
  },

  pendingEmbeddingJobs: ({ limit }) => database().pendingEmbeddingJobs(limit),

  storeEmbeddings: ({ pageId, model, chunkIds, vectors }) =>
    database().storeEmbeddings(pageId, model, chunkIds, vectors),

  markEmbeddingError: ({ pageId }) => database().markEmbeddingError(pageId),

  search: (params) => database().search(params),

  recent: ({ range, limit }) => database().recent(range, limit),

  async deletePage({ pageId }) {
    const deleted = database().deletePage(pageId)
    if (deleted?.screenshotFile) await rm(join(screenshotsDir, deleted.screenshotFile), { force: true })
    return { deleted: deleted !== null }
  },

  async deleteHost({ host }) {
    const { deleted, screenshotFiles } = database().deleteHost(host)
    await Promise.all(screenshotFiles.map((f) => rm(join(screenshotsDir, f), { force: true })))
    return { deleted }
  },

  async clearAll() {
    database().clearAll()
    const files = await readdir(screenshotsDir).catch(() => [] as string[])
    await Promise.all(files.map((f) => rm(join(screenshotsDir, f), { force: true })))
  },

  stats: () => database().stats(),

  close() {
    db?.close()
    db = null
  }
})
