import { Menu } from 'electron'

/**
 * Le menu par défaut d'Electron définit Ctrl+R / Ctrl+W qui agiraient sur l'UI du navigateur
 * au lieu de l'onglet. On le remplace : les raccourcis sont gérés dans shortcuts.ts.
 * Sur macOS, un menu Édition reste nécessaire pour copier/coller dans les champs texte.
 */
export function installAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
  )
}
