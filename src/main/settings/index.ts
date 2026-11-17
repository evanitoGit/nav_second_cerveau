import type { SettingsStore } from './SettingsStore'

let store: SettingsStore | null = null

/** Accès global aux réglages (initialisés une fois au démarrage, dans index.ts). */
export function setSettingsStore(s: SettingsStore): void {
  store = s
}

export function settings(): SettingsStore {
  if (!store) throw new Error('réglages non initialisés')
  return store
}
