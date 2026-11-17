import { app, BrowserWindow } from 'electron'
import { registerNavigationIpc } from './ipc/registerNavigationIpc'
import { applyAppHardening } from './security/hardening'
import { MainWindow } from './window/MainWindow'

let mainWindow: MainWindow | null = null

// Une seule instance du navigateur (évite deux accès concurrents à la future base SQLite).
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
    registerNavigationIpc(() => mainWindow)
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

function createMainWindow(): void {
  mainWindow = new MainWindow()
  mainWindow.window.on('closed', () => {
    mainWindow = null
  })
}
