import { app } from 'electron'
import electronUpdater from 'electron-updater'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Mises à jour automatiques depuis les releases GitHub du projet.
 * La nouvelle version est téléchargée en arrière-plan puis installée à la fermeture du navigateur
 * (Windows NSIS, AppImage, .deb). Rien ne se passe en développement.
 */
export function startAutoUpdates(): void {
  if (!app.isPackaged || process.env['SECOND_CERVEAU_DISABLE_UPDATES'] === '1') return
  const { autoUpdater } = electronUpdater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  autoUpdater.on('error', (err) => console.warn('[updater]', err.message))

  const check = () => void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined)
  setTimeout(check, 30_000) // ne ralentit pas le démarrage
  setInterval(check, CHECK_INTERVAL_MS).unref()
}
