import { app } from 'electron'
import electronUpdater from 'electron-updater'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

const enabled = () => app.isPackaged && process.env['SECOND_CERVEAU_DISABLE_UPDATES'] !== '1'

/**
 * Mises à jour automatiques depuis les releases GitHub du projet.
 * La nouvelle version est téléchargée en arrière-plan puis installée à la fermeture du navigateur
 * (Windows NSIS, AppImage, .deb). Rien ne se passe en développement.
 */
export function startAutoUpdates(): void {
  if (!enabled()) return
  const { autoUpdater } = electronUpdater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  autoUpdater.on('error', (err) => console.warn('[updater]', err.message))

  const check = () => void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined)
  setTimeout(check, 30_000) // ne ralentit pas le démarrage
  setInterval(check, CHECK_INTERVAL_MS).unref()
}

/** Vérification demandée depuis les réglages. Retourne un message pour l'utilisateur. */
export async function checkForUpdatesNow(): Promise<string> {
  if (!enabled()) return 'Les mises à jour automatiques ne sont actives que dans la version installée.'
  try {
    const result = await electronUpdater.autoUpdater.checkForUpdates()
    const latest = result?.updateInfo.version
    if (!latest || latest === app.getVersion()) return 'Second Cerveau est à jour.'
    return `La version ${latest} est en cours de téléchargement ; elle sera installée à la fermeture du navigateur.`
  } catch (err) {
    return `Vérification impossible : ${err instanceof Error ? err.message : String(err)}`
  }
}
