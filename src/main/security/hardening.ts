import { app, session, type Session } from 'electron'

/**
 * Durcissement global, appelé une seule fois avant la création de toute fenêtre.
 */
export function applyAppHardening(): void {
  app.on('web-contents-created', (_event, contents) => {
    // Interdit les <webview> : on n'utilise que des WebContentsView pilotées par le Main.
    contents.on('will-attach-webview', (e) => e.preventDefault())
  })

  // L'UI du navigateur n'a besoin d'aucune permission. Les sessions des pages web sont
  // confiées au PermissionManager (demande à l'utilisateur).
  lockDownSession(session.defaultSession)
}

function lockDownSession(ses: Session): void {
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
}
