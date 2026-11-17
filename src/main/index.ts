import { join } from 'node:path'
import { app, BrowserWindow, session } from 'electron'
import { BROWSING_PARTITION, PRIVATE_PARTITION } from './config'
import { DownloadManager } from './downloads/DownloadManager'
import { registerBrowserIpc } from './ipc/registerBrowserIpc'
import { MemoryService } from './memory/MemoryService'
import { registerScreenshotScheme, serveScreenshots } from './memory/screenshotProtocol'
import { installAppMenu } from './menu'
import { PermissionManager } from './permissions/PermissionManager'
import { applyAppHardening } from './security/hardening'
import { SessionStore } from './session/SessionStore'
import { startAutoUpdates } from './updater'
import { MainWindow, type MainWindowServices } from './window/MainWindow'

let mainWindow: MainWindow | null = null
let memory: MemoryService | null = null

// Dossier de données fixe (mémoire, modèle, cookies), identique en développement et une fois installé :
// sans cela, le nom du produit (« Second Cerveau ») changerait l'emplacement par défaut.
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), 'nav-second-cerveau'))
}

registerScreenshotScheme()

// Une seule instance du navigateur : un seul écrivain sur la base SQLite.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = mainWindow?.window
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    applyAppHardening()
    installAppMenu()

    const userData = app.getPath('userData')
    memory = new MemoryService(userData)
    memory.start().catch((err) => console.error('[memory] démarrage impossible :', err))
    serveScreenshots(memory.screenshotsDir)

    const downloads = new DownloadManager()
    const permissions = new PermissionManager(
      join(userData, 'permissions.json'),
      (contents) => mainWindow?.tabs.all.find((t) => t.webContents === contents)?.id ?? null
    )
    for (const [partition, isPrivate] of [[BROWSING_PARTITION, false], [PRIVATE_PARTITION, true]] as const) {
      const ses = session.fromPartition(partition)
      downloads.watch(ses)
      permissions.attach(ses, isPrivate)
    }

    const services: MainWindowServices = {
      memory,
      downloads,
      permissions,
      session: new SessionStore(join(userData, 'session.json'))
    }
    registerBrowserIpc(() => mainWindow, services)
    createMainWindow(services)
    startAutoUpdates()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(services)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Ferme proprement la base (WAL) et les workers avant de quitter.
  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting || !memory) return
    event.preventDefault()
    quitting = true
    const service = memory
    memory = null
    const timeout = new Promise((resolve) => setTimeout(resolve, 3_000))
    void Promise.race([service.dispose(), timeout]).finally(() => app.quit())
  })
}

function createMainWindow(services: MainWindowServices): void {
  mainWindow = new MainWindow(services)
  mainWindow.window.on('closed', () => {
    mainWindow = null
  })
}
