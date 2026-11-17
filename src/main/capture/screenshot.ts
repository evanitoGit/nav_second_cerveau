import type { WebContents } from 'electron'
import { SCREENSHOT_QUALITY, SCREENSHOT_WIDTH } from '../memory/config'
import type { ScreenshotPayload } from '../workers/types'

/**
 * Capture la partie visible de la page (ce que l'utilisateur a réellement vu).
 * Le redimensionnement (Skia, quelques ms) se fait ici ; l'encodage WebP, plus coûteux, dans le worker.
 */
export async function captureScreenshot(contents: WebContents, webp: boolean): Promise<ScreenshotPayload | null> {
  const image = await contents.capturePage()
  if (image.isEmpty()) return null
  const resized = image.getSize().width > SCREENSHOT_WIDTH ? image.resize({ width: SCREENSHOT_WIDTH, quality: 'good' }) : image

  if (!webp) {
    const jpeg = resized.toJPEG(SCREENSHOT_QUALITY)
    return { kind: 'jpeg', data: toArrayBuffer(jpeg) }
  }
  const { width, height } = resized.getSize()
  const bitmap = resized.toBitmap()
  // Taille réelle des pixels (peut différer de getSize() sur écran HiDPI).
  const scale = Math.sqrt(bitmap.length / 4 / (width * height)) || 1
  return {
    kind: 'bgra',
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    data: toArrayBuffer(bitmap)
  }
}

/** Copie dans un ArrayBuffer dédié, transférable sans copie vers le worker. */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const out = new ArrayBuffer(buf.byteLength)
  new Uint8Array(out).set(buf)
  return out
}
