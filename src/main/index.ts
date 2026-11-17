import { app, BrowserWindow } from 'electron'
import { registerBrowserIpc } from './ipc/registerBrowserIpc'
import { MemoryService } from './memory/MemoryService'
import { installAppMenu } from './menu'
import { applyAppHardening } from './security/hardening'
import { MainWindow } from './window/MainWindow'

let mainWindow: MainWindow | null = null
let memory: MemoryService | null = null

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

    memory = new MemoryService(app.getPath('userData'))
    memory.start().catch((err) => console.error('[memory] démarrage impossible :', err))

    registerBrowserIpc(() => mainWindow, memory)
    createMainWindow(memory)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && memory) createMainWindow(memory)
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

function createMainWindow(memoryService: MemoryService): void {
  mainWindow = new MainWindow(memoryService)
  mainWindow.window.on('closed', () => {
    mainWindow = null
  })
}
