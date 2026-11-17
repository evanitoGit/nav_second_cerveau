import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { DEFAULT_SETTINGS, normalizeHost, SEARCH_ENGINES, type Settings } from '@shared/settings'
import type { SettingsPatch } from '@shared/ipc'
import { isSafeWebUrl } from '@shared/url'

export type { SettingsPatch }

/**
 * Réglages persistants (settings.json). Toute valeur venant de l'UI est validée :
 * une valeur invalide est ignorée et la valeur par défaut est conservée.
 */
export class SettingsStore extends EventEmitter<{ changed: [Settings] }> {
  private value: Settings
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private readonly path: string) {
    super()
    let stored: unknown = {}
    try {
      stored = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      /* premier lancement */
    }
    this.value = sanitize(DEFAULT_SETTINGS, stored as SettingsPatch)
  }

  get(): Settings {
    return structuredClone(this.value)
  }

  get searchUrl(): string {
    return SEARCH_ENGINES[this.value.searchEngine].url
  }

  update(patch: SettingsPatch): Settings {
    this.value = sanitize(this.value, patch)
    this.emit('changed', this.get())
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      const tmp = `${this.path}.tmp`
      void writeFile(tmp, JSON.stringify(this.value, null, 2))
        .then(() => rename(tmp, this.path))
        .catch((err) => console.warn('[settings] sauvegarde impossible', err))
    }, 300)
    return this.get()
  }
}

function sanitize(base: Settings, patch: SettingsPatch | null | undefined): Settings {
  const out = structuredClone(base)
  if (!patch || typeof patch !== 'object') return out
  const m = patch.memory
  if (m && typeof m === 'object') {
    if (typeof m.enabled === 'boolean') out.memory.enabled = m.enabled
    if (Array.isArray(m.excludedHosts)) {
      const hosts = m.excludedHosts.map((h) => (typeof h === 'string' ? normalizeHost(h) : null))
      out.memory.excludedHosts = [...new Set(hosts.filter((h): h is string => !!h))].sort().slice(0, 500)
    }
  }
  if (typeof patch.searchEngine === 'string' && patch.searchEngine in SEARCH_ENGINES) out.searchEngine = patch.searchEngine
  if (typeof patch.homeUrl === 'string' && isSafeWebUrl(patch.homeUrl) && patch.homeUrl.length < 2048) out.homeUrl = patch.homeUrl
  if (typeof patch.restoreSession === 'boolean') out.restoreSession = patch.restoreSession
  if (patch.adblock && typeof patch.adblock.enabled === 'boolean') out.adblock.enabled = patch.adblock.enabled
  return out
}
