import { useEffect, useState, type ReactNode } from 'react'
import { Brain, Globe, Info, Settings as SettingsIcon, Shield, Trash2, X } from 'lucide-react'
import type { SettingsPatch } from '@shared/ipc'
import type { MemoryStats } from '@shared/memory'
import { normalizeHost, SEARCH_ENGINES, type SearchEngineId, type Settings } from '@shared/settings'
import { PANEL_WIDTH } from './DownloadsPanel'

type SavedPermission = { origin: string; permission: string; decision: 'allow' | 'deny' }

const PERMISSION_LABELS: Record<string, string> = {
  'media:video': 'Caméra',
  'media:audio': 'Micro',
  notifications: 'Notifications',
  geolocation: 'Position',
  'clipboard-read': 'Presse-papiers',
  midi: 'MIDI',
  midiSysex: 'MIDI'
}

export function SettingsPanel({ onClose }: { onClose(): void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [perms, setPerms] = useState<SavedPermission[]>([])
  const [info, setInfo] = useState<{ version: string; platform: string; electron: string } | null>(null)
  const [newHost, setNewHost] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
    void window.api.memory.getStats().then(setStats)
    void window.api.privacy.savedPermissions().then(setPerms)
    void window.api.app.info().then(setInfo)
    const offSettings = window.api.settings.onChanged(setSettings)
    const offMemory = window.api.memory.onChanged(() => void window.api.memory.getStats().then(setStats))
    return () => {
      offSettings()
      offMemory()
    }
  }, [])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(t)
  }, [message])

  if (!settings) return <aside style={{ width: PANEL_WIDTH }} className="h-full shrink-0 border-l border-zinc-800 bg-zinc-900" />

  const update = (patch: SettingsPatch) => void window.api.settings.update(patch).then(setSettings)
  const excluded = settings.memory.excludedHosts

  const addExclusion = async (forget: boolean) => {
    const host = normalizeHost(newHost)
    if (!host) return setMessage('Adresse de site invalide.')
    update({ memory: { excludedHosts: [...excluded, host] } })
    setNewHost('')
    if (forget) {
      const n = await window.api.memory.forgetHost(host)
      setMessage(`${host} exclu ; ${n} page${n > 1 ? 's' : ''} oubliée${n > 1 ? 's' : ''}.`)
    } else setMessage(`${host} ne sera plus mémorisé.`)
  }

  const origins = [...new Set(perms.map((p) => p.origin))]

  return (
    <aside style={{ width: PANEL_WIDTH }} className="flex h-full shrink-0 flex-col border-l border-zinc-800 bg-zinc-900" aria-label="Réglages">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <SettingsIcon className="h-4 w-4 text-sky-400" />
        <h2 className="flex-1 text-sm font-semibold text-zinc-100">Réglages</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      {message && <div className="mx-4 mb-2 rounded-md bg-sky-950/70 px-3 py-2 text-xs text-sky-200">{message}</div>}

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6 text-sm">
        <Section icon={<Brain className="h-4 w-4" />} title="Mémoire">
          <Toggle
            label="Mémoriser les pages que je lis"
            hint="En pause, rien n'est enregistré ; la recherche reste disponible."
            checked={settings.memory.enabled}
            onChange={(enabled) => update({ memory: { enabled } })}
          />
          {stats && (
            <p className="text-xs text-zinc-500">
              {stats.pages} pages · {stats.visits} visites · IA : {stats.embeddingModel.status === 'ready' ? 'prête' : stats.embeddingModel.status === 'error' ? 'indisponible' : stats.embeddingModel.status === 'loading' ? 'chargement…' : 'en veille'}
            </p>
          )}

          <div>
            <div className="mb-1.5 text-xs font-medium text-zinc-300">Sites jamais mémorisés</div>
            <div className="flex gap-1.5">
              <input
                value={newHost}
                onChange={(e) => setNewHost(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addExclusion(false)}
                placeholder="ex. mabanque.fr"
                spellCheck={false}
                className="min-w-0 flex-1 select-text rounded-md bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
              <button type="button" onClick={() => void addExclusion(true)} title="Exclure et oublier les pages déjà mémorisées" className="rounded-md bg-zinc-800 px-2 text-xs text-zinc-200 ring-1 ring-zinc-700 hover:bg-zinc-700">
                Exclure
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {excluded.map((h) => (
                <li key={h} className="flex items-center justify-between rounded px-2 py-1 text-zinc-300 hover:bg-zinc-800/60">
                  <span className="truncate">{h}</span>
                  <button type="button" onClick={() => update({ memory: { excludedHosts: excluded.filter((x) => x !== h) } })} className="text-xs text-zinc-500 hover:text-zinc-200">
                    Retirer
                  </button>
                </li>
              ))}
              {excluded.length === 0 && <li className="text-xs text-zinc-600">Aucun site exclu.</li>}
            </ul>
          </div>

          <button
            type="button"
            onClick={async () => {
              if (!confirmClear) return setConfirmClear(true)
              setConfirmClear(false)
              await window.api.memory.clearAll()
              setMessage('Mémoire entièrement effacée.')
            }}
            onBlur={() => setConfirmClear(false)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${confirmClear ? 'bg-red-600 text-white' : 'text-red-300 ring-1 ring-red-900 hover:bg-red-950/50'}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmClear ? 'Confirmer : tout effacer définitivement' : 'Effacer toute la mémoire'}
          </button>
        </Section>

        <Section icon={<Globe className="h-4 w-4" />} title="Navigation">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Moteur de recherche</span>
            <select
              value={settings.searchEngine}
              onChange={(e) => update({ searchEngine: e.target.value as SearchEngineId })}
              className="w-full rounded-md bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            >
              {Object.entries(SEARCH_ENGINES).map(([id, e]) => (
                <option key={id} value={id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Page d'accueil (premier lancement)</span>
            <input
              defaultValue={settings.homeUrl}
              onBlur={(e) => update({ homeUrl: e.target.value.trim() })}
              spellCheck={false}
              className="w-full select-text rounded-md bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <Toggle label="Rouvrir les onglets au démarrage" checked={settings.restoreSession} onChange={(restoreSession) => update({ restoreSession })} />
          <Toggle
            label="Bloquer les publicités et les traqueurs"
            hint="Listes EasyList / EasyPrivacy, mises à jour automatiquement."
            checked={settings.adblock.enabled}
            onChange={(enabled) => update({ adblock: { enabled } })}
          />
        </Section>

        <Section icon={<Shield className="h-4 w-4" />} title="Confidentialité">
          <div>
            <div className="mb-1.5 text-xs font-medium text-zinc-300">Autorisations des sites</div>
            {origins.length === 0 && <p className="text-xs text-zinc-600">Aucune autorisation enregistrée.</p>}
            <ul className="space-y-1">
              {origins.map((origin) => (
                <li key={origin} className="flex items-start justify-between gap-2 rounded px-2 py-1 hover:bg-zinc-800/60">
                  <div className="min-w-0">
                    <div className="truncate text-zinc-200">{origin.replace(/^https?:\/\//, '')}</div>
                    <div className="text-[11px] text-zinc-500">
                      {perms
                        .filter((p) => p.origin === origin)
                        .map((p) => `${PERMISSION_LABELS[p.permission] ?? p.permission} : ${p.decision === 'allow' ? 'autorisé' : 'bloqué'}`)
                        .join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await window.api.privacy.revokePermissions(origin)
                      setPerms(await window.api.privacy.savedPermissions())
                    }}
                    className="shrink-0 text-xs text-zinc-500 hover:text-zinc-200"
                  >
                    Réinitialiser
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={async () => {
              await window.api.privacy.clearBrowsingData()
              setMessage('Cookies, données des sites et cache effacés.')
            }}
            className="rounded-md px-3 py-1.5 text-xs text-zinc-200 ring-1 ring-zinc-700 hover:bg-zinc-800"
          >
            Effacer cookies, données des sites et cache
          </button>
        </Section>

        <Section icon={<Info className="h-4 w-4" />} title="À propos">
          {info && (
            <p className="text-xs leading-relaxed text-zinc-400">
              Second Cerveau {info.version}
              <br />
              {info.platform} · Electron {info.electron}
            </p>
          )}
          <button
            type="button"
            onClick={async () => setMessage(await window.api.app.checkForUpdates())}
            className="rounded-md px-3 py-1.5 text-xs text-zinc-200 ring-1 ring-zinc-700 hover:bg-zinc-800"
          >
            Rechercher des mises à jour
          </button>
        </Section>
      </div>
    </aside>
  )
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <span className="block text-zinc-200">{label}</span>
        {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-sky-600' : 'bg-zinc-700'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}
