import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { Globe, KeyRound, Sparkles, Trash2 } from 'lucide-react'
import { HIGHLIGHT_END, HIGHLIGHT_START, type MemorySearchResult } from '@shared/memory'
import { formatVisit, hostOf } from '../../lib/relativeTime'

interface ResultCardProps {
  result: MemorySearchResult
  selected: boolean
  onOpen(result: MemorySearchResult, background: boolean): void
  onForget(result: MemorySearchResult): void
  onHover(): void
}

export function ResultCard({ result, selected, onOpen, onForget, onHover }: ResultCardProps) {
  const [confirming, setConfirming] = useState(false)
  const [thumbBroken, setThumbBroken] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])

  const open = (e: MouseEvent) => onOpen(result, e.button === 1 || e.ctrlKey || e.metaKey)

  return (
    <li
      role="option"
      aria-selected={selected}
      onMouseEnter={onHover}
      onClick={open}
      onAuxClick={(e) => e.button === 1 && open(e)}
      className={`group relative flex cursor-pointer gap-3 rounded-lg p-2 transition-colors ${
        selected ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
      }`}
    >
      <div className="relative h-[68px] w-[108px] shrink-0 overflow-hidden rounded-md bg-zinc-800 ring-1 ring-zinc-700/60">
        {result.screenshotUrl && !thumbBroken ? (
          <img
            src={result.screenshotUrl}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setThumbBroken(true)}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600">
            <Globe className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[13px] font-medium leading-snug text-zinc-100">{result.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="truncate">{result.siteName || hostOf(result.url)}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0" title={new Date(result.lastVisitedAt).toLocaleString('fr-FR')}>
            {formatVisit(result.lastVisitedAt)}
          </span>
          {result.visitCount > 1 && <span className="shrink-0">· {result.visitCount} visites</span>}
        </div>
        {result.snippet && (
          <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-zinc-400">
            <Highlighted text={result.snippet} />
          </p>
        )}
        {(result.matchedBy.keywords || result.matchedBy.semantic) && (
          <div className="mt-1.5 flex gap-1.5">
            {result.matchedBy.semantic && (
              <Badge icon={<Sparkles className="h-3 w-3" />} label="sens" title="Proche par le sens (IA locale)" />
            )}
            {result.matchedBy.keywords && (
              <Badge icon={<KeyRound className="h-3 w-3" />} label="mots-clés" title="Contient vos mots" />
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        title={confirming ? 'Cliquez à nouveau pour oublier définitivement cette page' : 'Oublier cette page'}
        aria-label="Oublier cette page"
        onClick={(e) => {
          e.stopPropagation()
          if (confirming) onForget(result)
          else setConfirming(true)
        }}
        className={`absolute right-1.5 top-1.5 flex h-6 items-center gap-1 rounded px-1.5 text-[11px] transition ${
          confirming
            ? 'bg-red-600 text-white'
            : 'text-zinc-500 opacity-0 hover:bg-zinc-700 hover:text-zinc-200 group-hover:opacity-100'
        }`}
      >
        <Trash2 className="h-3 w-3" />
        {confirming && 'Oublier ?'}
      </button>
    </li>
  )
}

function Badge({ icon, label, title }: { icon: ReactNode; label: string; title: string }) {
  return (
    <span title={title} className="flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
      {icon}
      {label}
    </span>
  )
}

/** Affiche l'extrait en surlignant les passages balisés par le Main (aucun HTML injecté). */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(new RegExp(`(${HIGHLIGHT_START}[^${HIGHLIGHT_END}]*${HIGHLIGHT_END})`))
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith(HIGHLIGHT_START) ? (
          <mark key={i} className="rounded-sm bg-sky-500/25 px-0.5 text-sky-200">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}
