import type { TabState } from '@shared/types'

export const isBlankUrl = (url: string) => url === '' || url === 'about:blank'

/** URL affichée dans la barre d'adresse (vide pour un nouvel onglet). */
export const displayUrl = (url: string) => (isBlankUrl(url) ? '' : url)

export function tabTitle(tab: TabState): string {
  if (isBlankUrl(tab.url) && !tab.isLoading) return tab.isPrivate ? 'Onglet privé' : 'Nouvel onglet'
  return tab.title || tab.url
}
