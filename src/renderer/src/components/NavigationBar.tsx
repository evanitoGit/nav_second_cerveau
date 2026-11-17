import { forwardRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react'
import type { NavigationState } from '@shared/types'
import { AddressBar } from './AddressBar'

interface NavigationBarProps {
  state: NavigationState
}

export const NavigationBar = forwardRef<HTMLElement, NavigationBarProps>(function NavigationBar(
  { state },
  ref
) {
  const nav = window.api.navigation

  return (
    <header
      ref={ref}
      className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-800 bg-zinc-900 px-2"
    >
      <NavButton label="Précédent" disabled={!state.canGoBack} onClick={() => void nav.back()}>
        <ArrowLeft className="h-4 w-4" />
      </NavButton>
      <NavButton label="Suivant" disabled={!state.canGoForward} onClick={() => void nav.forward()}>
        <ArrowRight className="h-4 w-4" />
      </NavButton>
      {state.isLoading ? (
        <NavButton label="Arrêter" onClick={() => void nav.stop()}>
          <X className="h-4 w-4" />
        </NavButton>
      ) : (
        <NavButton label="Actualiser" onClick={() => void nav.reload()}>
          <RotateCw className="h-4 w-4" />
        </NavButton>
      )}

      <div className="ml-1 flex min-w-0 flex-1">
        <AddressBar url={state.url} favicon={state.favicon} onSubmit={(v) => void nav.navigate(v)} />
      </div>

      {/* Barre de progression discrète pendant le chargement */}
      <div
        className={`pointer-events-none absolute left-0 top-12 h-0.5 bg-sky-500 transition-all duration-500 ${
          state.isLoading ? 'w-2/3 opacity-100' : 'w-full opacity-0'
        }`}
      />
    </header>
  )
})

interface NavButtonProps {
  label: string
  disabled?: boolean
  onClick(): void
  children: ReactNode
}

function NavButton({ label, disabled, onClick, children }: NavButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-default disabled:text-zinc-600 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
