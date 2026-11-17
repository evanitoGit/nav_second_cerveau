import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol, session } from 'electron'
import { SCREENSHOT_SCHEME } from './MemoryService'

/** À appeler avant `app.ready` : le schéma doit être déclaré comme sécurisé. */
export function registerScreenshotScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCREENSHOT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false } }
  ])
}

/**
 * Sert `memory://screenshots/<id>.webp` depuis le dossier des captures.
 * Enregistré uniquement sur la session par défaut (celle de l'UI) : les pages web, qui utilisent
 * les partitions `persist:browsing` / `private`, ne peuvent pas lire la mémoire de l'utilisateur.
 */
export function serveScreenshots(screenshotsDir: string): void {
  session.defaultSession.protocol.handle(SCREENSHOT_SCHEME, (request) => {
    const url = new URL(request.url)
    const match = /^\/(\d+\.(?:webp|jpg))$/.exec(decodeURIComponent(url.pathname))
    if (url.hostname !== 'screenshots' || !match) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(join(screenshotsDir, match[1])).toString())
  })
}
