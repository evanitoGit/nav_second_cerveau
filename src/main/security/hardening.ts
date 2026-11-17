import { app, session, type Session } from 'electron'
import { BROWSING_PARTITION } from '../config'

/**
 * Durcissement global, appelé une seule fois avant la création de toute fenêtre.
 */
export function applyAppHardening(): void {
  app.on('web-contents-created', (_event, contents) => {
    // Interdit les <webview> : on n'utilise que des WebContentsView pilotées par le Main.
    contents.on('will-attach-webview', (e) => e.preventDefault())
  })

  lockDownSession(session.defaultSession)
  lockDownSession(session.fromPartition(BROWSING_PARTITION))
}

/**
 * Politique de permissions MVP : tout est refusé (caméra, micro, géoloc, notifications…).
 * Une UI d'autorisation par site sera ajoutée plus tard.
 */
function lockDownSession(ses: Session): void {
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
}
