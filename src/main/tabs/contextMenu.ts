import { clipboard, Menu, type BrowserWindow, type MenuItemConstructorOptions, type WebContents } from 'electron'
import { isSafeWebUrl } from '@shared/url'

export interface PageMenuActions {
  openInNewTab(url: string, options: { background: boolean; isPrivate?: boolean }): void
  searchWeb(text: string): void
  print(): void
}

/**
 * Menu contextuel natif des pages web (Electron n'en fournit aucun par défaut).
 * Le contenu s'adapte à la cible : lien, image, texte sélectionné, champ éditable ou page.
 */
export function attachPageContextMenu(
  contents: WebContents,
  window: BrowserWindow,
  isPrivate: boolean,
  actions: PageMenuActions
): void {
  contents.on('context-menu', (_e, params) => {
    const items: MenuItemConstructorOptions[] = []
    const section = (entries: MenuItemConstructorOptions[]) => {
      if (entries.length === 0) return
      if (items.length > 0) items.push({ type: 'separator' })
      items.push(...entries)
    }

    const link = params.linkURL && isSafeWebUrl(params.linkURL) ? params.linkURL : null
    if (link) {
      section([
        { label: 'Ouvrir le lien dans un nouvel onglet', click: () => actions.openInNewTab(link, { background: true }) },
        ...(isPrivate
          ? []
          : [{ label: 'Ouvrir le lien dans un onglet privé', click: () => actions.openInNewTab(link, { background: false, isPrivate: true }) }]),
        { label: "Copier l'adresse du lien", click: () => clipboard.writeText(link) }
      ])
    }

    if (params.mediaType === 'image' && params.srcURL) {
      const src = params.srcURL
      section([
        ...(isSafeWebUrl(src)
          ? [{ label: "Ouvrir l'image dans un nouvel onglet", click: () => actions.openInNewTab(src, { background: true }) }]
          : []),
        { label: "Enregistrer l'image sous…", click: () => contents.downloadURL(src) },
        { label: "Copier l'image", click: () => contents.copyImageAt(params.x, params.y) },
        ...(isSafeWebUrl(src) ? [{ label: "Copier l'adresse de l'image", click: () => clipboard.writeText(src) }] : [])
      ])
    }

    if (params.isEditable) {
      const f = params.editFlags
      section([
        { label: 'Annuler', role: 'undo', enabled: f.canUndo },
        { label: 'Rétablir', role: 'redo', enabled: f.canRedo },
        { type: 'separator' },
        { label: 'Couper', role: 'cut', enabled: f.canCut },
        { label: 'Copier', role: 'copy', enabled: f.canCopy },
        { label: 'Coller', role: 'paste', enabled: f.canPaste },
        { label: 'Tout sélectionner', role: 'selectAll', enabled: f.canSelectAll }
      ])
    } else if (params.selectionText.trim()) {
      const text = params.selectionText.trim()
      const preview = text.length > 28 ? `${text.slice(0, 28)}…` : text
      section([
        { label: 'Copier', role: 'copy' },
        { label: `Rechercher « ${preview} » sur Google`, click: () => actions.searchWeb(text) }
      ])
    }

    if (!link && params.mediaType === 'none' && !params.isEditable && !params.selectionText.trim()) {
      const history = contents.navigationHistory
      section([
        { label: 'Précédent', enabled: history.canGoBack(), click: () => history.goBack() },
        { label: 'Suivant', enabled: history.canGoForward(), click: () => history.goForward() },
        { label: 'Actualiser', click: () => contents.reload() },
        { type: 'separator' },
        { label: 'Imprimer…', click: () => actions.print() }
      ])
    }

    section([{ label: 'Inspecter', click: () => contents.inspectElement(params.x, params.y) }])
    Menu.buildFromTemplate(items).popup({ window })
  })
}

/** Menu des champs texte de l'UI du navigateur (barre d'adresse, recherche mémoire…). */
export function attachUiContextMenu(contents: WebContents, window: BrowserWindow): void {
  contents.on('context-menu', (_e, params) => {
    if (!params.isEditable && !params.selectionText) return
    const f = params.editFlags
    Menu.buildFromTemplate([
      { label: 'Couper', role: 'cut', enabled: f.canCut },
      { label: 'Copier', role: 'copy', enabled: f.canCopy },
      { label: 'Coller', role: 'paste', enabled: f.canPaste },
      { type: 'separator' },
      { label: 'Tout sélectionner', role: 'selectAll', enabled: f.canSelectAll }
    ]).popup({ window })
  })
}
