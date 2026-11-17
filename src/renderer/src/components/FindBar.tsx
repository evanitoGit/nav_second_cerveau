import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { FindResult } from '@shared/types'

interface FindBarProps {
  tabId: number | null
  onClose(): void
}

/** Recherche dans la page (Ctrl+F). Entrée = suivant, Maj+Entrée = précédent, Échap = fermer. */
export function FindBar({ tabId, onClose }: FindBarProps) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<FindResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const find = window.api.find

  useEffect(() => {
    inputRef.current?.focus()
    return () => void find.stop()
  }, [find])

  useEffect(() => find.onResult((r) => r.tabId === tabId && setResult(r)), [find, tabId])

  // Ctrl+F alors que la barre est ouverte : resélectionne le texte.
  useEffect(() => {
    const refocus = () => inputRef.current?.select()
    window.addEventListener('focus-find', refocus)
    return () => window.removeEventListener('focus-find', refocus)
  }, [])

  const search = (value: string) => {
    setText(value)
    if (value) void find.start(value, true, false)
    else {
      setResult(null)
      void find.stop()
    }
  }

  const step = (forward: boolean) => text && void find.start(text, forward, true)
  const noMatch = text && result && result.matches === 0

  return (
    <div className="flex h-10 shrink-0 items-center justify-end gap-2 border-b border-zinc-800 bg-zinc-900 px-3">
      <div
        className={`flex h-7 w-80 items-center gap-2 rounded-md bg-zinc-800 px-2 ring-1 ${
          noMatch ? 'ring-red-500/70' : 'ring-zinc-700 focus-within:ring-sky-500'
        }`}
      >
        <input
          ref={inputRef}
          value={text}
          spellCheck={false}
          placeholder="Rechercher dans la page"
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') step(!e.shiftKey)
            if (e.key === 'Escape') onClose()
          }}
          className="min-w-0 flex-1 select-text bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <span className="shrink-0 text-xs tabular-nums text-zinc-400">
          {text && result ? `${result.matches ? result.activeMatch : 0}/${result.matches}` : ''}
        </span>
      </div>
      <IconButton label="Précédent (Maj+Entrée)" onClick={() => step(false)}>
        <ChevronUp className="h-4 w-4" />
      </IconButton>
      <IconButton label="Suivant (Entrée)" onClick={() => step(true)}>
        <ChevronDown className="h-4 w-4" />
      </IconButton>
      <IconButton label="Fermer (Échap)" onClick={onClose}>
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
    >
      {children}
    </button>
  )
}
