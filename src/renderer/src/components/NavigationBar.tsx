import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Brain, RotateCw, X } from 'lucide-react'
import type { TabState } from '@shared/types'
import { AddressBar } from './AddressBar'

interface NavigationBarProps {
  tab: TabState | null
  memoryOpen: boolean
  onToggleMemory(): void
}

export function NavigationBar({ tab, memoryOpen, onToggleMemory }: NavigationBarProps) {
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
          onSubmit={(v) => void nav.navigate(v)}
        />
      </div>

      <NavButton label="Mémoire (Ctrl+Maj+K)" active={memoryOpen} onClick={onToggleMemory}>
        <Brain className="h-4 w-4" />
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
