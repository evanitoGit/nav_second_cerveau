import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Brain, Download, RotateCw, Settings, X } from 'lucide-react'
import type { DownloadState, TabState } from '@shared/types'
import { AddressBar } from './AddressBar'

interface NavigationBarProps {
  tab: TabState | null
  downloads: DownloadState[]
  memoryOpen: boolean
  downloadsOpen: boolean
  onToggleMemory(): void
  onToggleDownloads(): void
  settingsOpen: boolean
  onToggleSettings(): void
}

export function NavigationBar(props: NavigationBarProps) {
  const { tab, downloads, memoryOpen, downloadsOpen, onToggleMemory, onToggleDownloads, settingsOpen, onToggleSettings } = props
  const nav = window.api.navigation

  return (
    <div className="relative flex h-12 shrink-0 items-center gap-1 border-b border-zinc-800 bg-zinc-900 px-2">
      <NavButton label="Précédent (Alt+←)" disabled={!tab?.canGoBack} onClick={() => void nav.back()}>
        <ArrowLeft className="h-4 w-4" />
      </NavButton>
      <NavButton label="Suivant (Alt+→)" disabled={!tab?.canGoForward} onClick={() => void nav.forward()}>
        <ArrowRight className="h-4 w-4" />
      </NavButton>
      {tab?.isLoading ? (
        <NavButton label="Arrêter" onClick={() => void nav.stop()}>
          <X className="h-4 w-4" />
        </NavButton>
      ) : (
        <NavButton label="Actualiser (Ctrl+R)" disabled={!tab} onClick={() => void nav.reload()}>
          <RotateCw className="h-4 w-4" />
        </NavButton>
      )}

      <div className="ml-1 flex min-w-0 flex-1">
        <AddressBar
          tabId={tab?.id ?? null}
          url={tab?.url ?? ''}
          isPrivate={tab?.isPrivate ?? false}
          memory={tab?.memory ?? 'idle'}
          zoomFactor={tab?.zoomFactor ?? 1}
          blockedCount={tab?.blockedCount ?? 0}
          onSubmit={(v) => void nav.navigate(v)}
        />
      </div>

      {downloads.length > 0 && (
        <NavButton label="Téléchargements (Ctrl+J)" active={downloadsOpen} onClick={onToggleDownloads}>
          <DownloadIndicator downloads={downloads} />
        </NavButton>
      )}
      <NavButton label="Mémoire (Ctrl+Maj+K)" active={memoryOpen} onClick={onToggleMemory}>
        <Brain className="h-4 w-4" />
      </NavButton>
      <NavButton label="Réglages (Ctrl+,)" active={settingsOpen} onClick={onToggleSettings}>
        <Settings className="h-4 w-4" />
      </NavButton>

      {/* Barre de progression discrète pendant le chargement */}
      <div
        className={`pointer-events-none absolute bottom-0 left-0 h-0.5 bg-sky-500 transition-all duration-500 ${
          tab?.isLoading ? 'w-2/3 opacity-100' : 'w-full opacity-0'
        }`}
      />
    </div>
  )
}

interface NavButtonProps {
  label: string
  disabled?: boolean
  active?: boolean
  onClick(): void
  children: ReactNode
}

function NavButton({ label, disabled, active, onClick, children }: NavButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-zinc-800 disabled:cursor-default disabled:text-zinc-600 disabled:hover:bg-transparent ${
        active ? 'bg-sky-500/15 text-sky-300' : 'text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

/** Icône de téléchargement entourée d'un anneau de progression tant qu'un fichier arrive. */
function DownloadIndicator({ downloads }: { downloads: DownloadState[] }) {
  const active = downloads.filter((d) => d.status === 'progressing' || d.status === 'paused')
  const total = active.reduce((n, d) => n + d.totalBytes, 0)
  const received = active.reduce((n, d) => n + d.receivedBytes, 0)
  const ratio = total > 0 ? received / total : 0.25
  const circumference = 2 * Math.PI * 13
  return (
    <span className="relative flex h-8 w-8 items-center justify-center">
      <Download className="h-4 w-4" />
      {active.length > 0 && (
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 32 32" aria-hidden>
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            className={total > 0 ? 'transition-all' : 'animate-pulse'}
          />
        </svg>
      )}
    </span>
  )
}
