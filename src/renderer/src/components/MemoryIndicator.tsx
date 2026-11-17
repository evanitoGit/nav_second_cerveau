import { Brain } from 'lucide-react'
import type { MemoryCaptureStatus } from '@shared/memory'

type Visible = Exclude<MemoryCaptureStatus, 'idle'>

const LABELS: Record<Visible, string> = {
  waiting: 'Cette page sera mémorisée si vous y restez quelques secondes',
  capturing: 'Mémorisation en cours…',
  captured: 'Page mémorisée dans votre second cerveau',
  skipped: 'Page non mémorisée (page sans texte ou site de connexion)',
  paused: 'Mémorisation en pause',
  excluded: 'Ce site n’est jamais mémorisé'
}

const STYLES: Record<Visible, string> = {
  waiting: 'text-zinc-500',
  capturing: 'text-sky-400 animate-pulse',
  captured: 'text-sky-400',
  skipped: 'text-zinc-600 opacity-60',
  paused: 'text-amber-400/80',
  excluded: 'text-zinc-600'
}

/** Icône cerveau de la barre d'adresse : état de mémorisation, clic = menu d'actions. */
export function MemoryIndicator({ status, isPrivate, tabId }: { status: MemoryCaptureStatus; isPrivate: boolean; tabId: number | null }) {
  if (status === 'idle' || isPrivate || tabId === null) return null
  return (
    <button
      type="button"
      title={`${LABELS[status]} — cliquer pour les options`}
      aria-label={LABELS[status]}
      onClick={() => void window.api.memory.showIndicatorMenu(tabId)}
      className="relative flex shrink-0 items-center rounded p-0.5 hover:bg-zinc-700"
    >
      <Brain className={`h-4 w-4 transition-colors ${STYLES[status]}`} />
      {(status === 'paused' || status === 'excluded') && (
        <span className="absolute left-0 top-1/2 h-px w-5 -rotate-45 bg-current text-zinc-400" aria-hidden />
      )}
    </button>
  )
}
