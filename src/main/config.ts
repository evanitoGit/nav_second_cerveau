import { app } from 'electron'

export const DEFAULT_HOME_URL = 'https://www.wikipedia.org'

/** Partition persistante des pages web : isolée de la session de l'UI du navigateur. */
export const BROWSING_PARTITION = 'persist:browsing'

/** Partition en mémoire (sans préfixe `persist:`) pour la navigation privée. */
export const PRIVATE_PARTITION = 'private'

/** Hauteur réservée à l'UI tant que le Renderer n'a pas mesuré la sienne. */
export const DEFAULT_CHROME_TOP = 84

/** Nombre d'onglets fermés mémorisés pour Ctrl+Maj+T. */
export const CLOSED_TABS_HISTORY = 25

export const isDev = !app.isPackaged
