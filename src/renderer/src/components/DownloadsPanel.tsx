import type { ReactNode } from 'react'
import { Download, File, FolderOpen, Pause, Play, X } from 'lucide-react'
import type { DownloadState } from '@shared/types'

export const PANEL_WIDTH = 400

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`
  const units = ['Ko', 'Mo', 'Go']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export function DownloadsPanel({ downloads, onClose }: { downloads: DownloadState[]; onClose(): void }) {
  const api = window.api.downloads
  const hasFinished = downloads.some((d) => d.status !== 'progressing' && d.status !== 'paused')

  return (
    <aside style={{ width: PANEL_WIDTH }} className="flex h-full shrink-0 flex-col border-l border-zinc-800 bg-zinc-900" aria-label="Téléchargements">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <Download className="h-4 w-4 text-sky-400" />
        <h2 className="flex-1 text-sm font-semibold text-zinc-100">Téléchargements</h2>
        {hasFinished && (
          <button type="button" onClick={() => void api.clearFinished()} className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            Effacer la liste
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {downloads.length === 0 && <li className="px-4 py-10 text-center text-sm text-zinc-500">Aucun téléchargement pour cette session.</li>}
        {downloads.map((d) => {
          const active = d.status === 'progressing' || d.status === 'paused'
          const pct = d.totalBytes > 0 ? Math.min(100, (d.receivedBytes / d.totalBytes) * 100) : null
          return (
            <li key={d.id} className="group flex gap-3 rounded-lg p-2 hover:bg-zinc-800/60">
              <File className={`mt-0.5 h-5 w-5 shrink-0 ${d.status === 'completed' ? 'text-sky-400' : 'text-zinc-500'}`} />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={d.status !== 'completed'}
                  onClick={() => void api.open(d.id)}
                  title={d.path}
                  className={`block max-w-full truncate text-left text-[13px] ${
                    d.status === 'completed' ? 'text-zinc-100 hover:underline' : d.status === 'progressing' || d.status === 'paused' ? 'text-zinc-200' : 'text-zinc-500 line-through'
                  }`}
                >
                  {d.filename}
                </button>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {d.status === 'completed' && formatBytes(d.receivedBytes)}
                  {d.status === 'cancelled' && 'Annulé'}
                  {d.status === 'interrupted' && 'Échec du téléchargement'}
                  {active && `${formatBytes(d.receivedBytes)}${d.totalBytes ? ` sur ${formatBytes(d.totalBytes)}` : ''}${d.status === 'paused' ? ' — en pause' : ''}`}
                </div>
                {active && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
                    <div className={`h-full bg-sky-500 transition-all ${pct === null ? 'w-1/3 animate-pulse' : ''}`} style={pct === null ? undefined : { width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-start gap-0.5">
                {active && (
                  <>
                    <SmallButton label={d.status === 'paused' ? 'Reprendre' : 'Pause'} onClick={() => void api.togglePause(d.id)}>
                      {d.status === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    </SmallButton>
                    <SmallButton label="Annuler" onClick={() => void api.cancel(d.id)}>
                      <X className="h-3.5 w-3.5" />
                    </SmallButton>
                  </>
                )}
                {d.status === 'completed' && (
                  <SmallButton label="Afficher dans le dossier" onClick={() => void api.showInFolder(d.id)}>
                    <FolderOpen className="h-3.5 w-3.5" />
                  </SmallButton>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

function SmallButton({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100">
      {children}
    </button>
  )
}
