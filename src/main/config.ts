import { app } from 'electron'

export const DEFAULT_HOME_URL = 'https://www.wikipedia.org'

/** Partition persistante des pages web : isolée de la session de l'UI du navigateur. */
export const BROWSING_PARTITION = 'persist:browsing'

/** Hauteur réservée à l'UI tant que le Renderer n'a pas mesuré la sienne. */
export const DEFAULT_CHROME_TOP = 48

export const isDev = !app.isPackaged
