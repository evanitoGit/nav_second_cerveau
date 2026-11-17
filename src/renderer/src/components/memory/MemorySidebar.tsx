import { useEffect, useRef, useState } from 'react'
import { Brain, CalendarRange, Loader2, Search, X } from 'lucide-react'
import type { MemorySearchResult, MemoryStats } from '@shared/memory'
import { useMemorySearch } from '../../hooks/useMemorySearch'
import { ResultCard } from './ResultCard'

export const MEMORY_SIDEBAR_WIDTH = 400
export const FOCUS_MEMORY_SEARCH_EVENT = 'focus-memory-search'

interface MemorySidebarProps {
  onClose(): void
  /** Ouvre un résultat (dans l'onglet courant s'il est vide, sinon dans un nouvel onglet). */
  onOpen(result: MemorySearchResult, background: boolean): void
}

export function MemorySidebar({ onClose, onOpen }: MemorySidebarProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { response, recent, stats, loading, error, removeLocally } = useMemorySearch(query, true)

  const searching = query.trim().length > 0
  const results = searching ? (response?.results ?? []) : recent

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => setSelected(0), [response, searching])
  // Raccourci pressé alors que la barre est déjà ouverte : on revient au champ de recherche.
  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener(FOCUS_MEMORY_SEARCH_EVENT, focus)
    return () => window.removeEventListener(FOCUS_MEMORY_SEARCH_EVENT, focus)
  }, [])

  const forget = async (result: MemorySearchResult) => {
    removeLocally(result.pageId)
    await window.api.memory.deletePage(result.pageId)
  }

  return (
    <aside
      style={{ width: MEMORY_SIDEBAR_WIDTH }}
      className="flex h-full shrink-0 flex-col border-l border-zinc-800 bg-zinc-900"
      aria-label="Mémoire"
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <Brain className="h-4 w-4 text-sky-400" />
        <h2 className="flex-1 text-sm font-semibold text-zinc-100">Mémoire</h2>
        <button
          type="button"
          onClick={onClose}
          title="Fermer (Échap)"
          aria-label="Fermer la mémoire"
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3">
        <div className="flex h-9 items-center gap-2 rounded-lg bg-zinc-800 px-3 ring-1 ring-zinc-700/60 focus-within:ring-2 focus-within:ring-sky-500">
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-400" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          )}
          <input
            ref={inputRef}
            value={query}
            spellCheck={false}
            placeholder="Ex. « l'article sur SQL lu la semaine dernière »"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelected((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelected((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter' && results[selected]) {
                onOpen(results[selected], e.ctrlKey || e.metaKey)
              } else if (e.key === 'Escape') {
                if (query) setQuery('')
                else onClose()
              }
            }}
            className="min-w-0 flex-1 select-text bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </div>
        <StatusLine stats={stats} />
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {searching && response?.range && (
          <div className="mx-2 mb-2 flex items-center gap-1.5 text-[11px] text-sky-300">
            <CalendarRange className="h-3.5 w-3.5" />
            Période : {response.range.label}
          </div>
        )}
        {searching && response?.semantic === 'unavailable' && (
          <div className="mx-2 mb-2 text-[11px] text-amber-400/90">
            IA pas encore prête : résultats par mots-clés uniquement.
          </div>
        )}
        {error && <div className="mx-2 mb-2 text-xs text-red-400">Erreur : {error}</div>}

        {!searching && results.length > 0 && (
          <div className="mx-2 mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Récemment mémorisées
          </div>
        )}

        <ul role="listbox" className="flex flex-col gap-0.5">
          {results.map((result, i) => (
            <ResultCard
              key={result.pageId}
              result={result}
              selected={i === selected}
              onHover={() => setSelected(i)}
              onOpen={onOpen}
              onForget={(r) => void forget(r)}
            />
          ))}
        </ul>

        <EmptyState searching={searching} loading={loading} hasResults={results.length > 0} hasResponse={!!response} stats={stats} />
      </div>
    </aside>
  )
}

function StatusLine({ stats }: { stats: MemoryStats | null }) {
  if (!stats) return <div className="h-6" />
  const { pages, pendingPages, embeddingModel } = stats
  let ai: string | null = null
  let tone = 'text-zinc-500'
  if (embeddingModel.status === 'loading') {
    ai = "Chargement de l'IA locale… (1er lancement : téléchargement ~120 Mo)"
    tone = 'text-sky-400'
  } else if (embeddingModel.status === 'error') {
    ai = 'IA indisponible : recherche par mots-clés'
    tone = 'text-amber-400/90'
  } else if (pendingPages > 0) {
    ai = `${pendingPages} page${pendingPages > 1 ? 's' : ''} en cours d'analyse`
  }
  return (
    <div className="flex h-6 items-center gap-1.5 px-1 text-[11px] text-zinc-500" title={embeddingModel.error}>
      <span>
        {pages} page{pages > 1 ? 's' : ''} mémorisée{pages > 1 ? 's' : ''}
      </span>
      {ai && (
        <>
          <span aria-hidden>·</span>
          <span className={`truncate ${tone}`}>{ai}</span>
        </>
      )}
    </div>
  )
}

function EmptyState(props: {
  searching: boolean
  loading: boolean
  hasResults: boolean
  hasResponse: boolean
  stats: MemoryStats | null
}) {
  if (props.hasResults || props.loading) return null
  if (props.searching && props.hasResponse) {
    return <p className="px-4 py-8 text-center text-sm text-zinc-500">Aucune page ne correspond.</p>
  }
  if (!props.searching && props.stats?.pages === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm leading-relaxed text-zinc-500">
        <Brain className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
        Votre mémoire est vide.
        <br />
        Restez quelques secondes sur une page pour qu'elle soit mémorisée, puis retrouvez-la ici en la décrivant.
      </div>
    )
  }
  return null
}
