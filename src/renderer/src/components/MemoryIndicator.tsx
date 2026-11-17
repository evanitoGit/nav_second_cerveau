import { Brain } from 'lucide-react'
import type { MemoryCaptureStatus } from '@shared/memory'

const LABELS: Record<Exclude<MemoryCaptureStatus, 'idle'>, string> = {
  waiting: 'Cette page sera mémorisée si vous y restez quelques secondes',
  capturing: 'Mémorisation en cours…',
  captured: 'Page mémorisée dans votre second cerveau',
  skipped: 'Page non mémorisée (navigation privée, site exclu ou page sans texte)'
}

const STYLES: Record<Exclude<MemoryCaptureStatus, 'idle'>, string> = {
  waiting: 'text-zinc-500',
  capturing: 'text-sky-400 animate-pulse',
  captured: 'text-sky-400',
  skipped: 'text-zinc-600 opacity-60'
}

/** Petit indicateur dans la barre d'adresse : l'utilisateur sait toujours ce qui est mémorisé. */
export function MemoryIndicator({ status, isPrivate }: { status: MemoryCaptureStatus; isPrivate: boolean }) {
  if (status === 'idle' || isPrivate) return null
  return (
    <span title={LABELS[status]} aria-label={LABELS[status]} className="flex shrink-0 items-center">
      <Brain className={`h-4 w-4 transition-colors ${STYLES[status]}`} />
    </span>
  )
}
