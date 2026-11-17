import { CloudOff, RotateCw } from 'lucide-react'
import type { TabState } from '@shared/types'
import { hostOf } from '../lib/relativeTime'

/** Codes réseau Chromium les plus courants (net/base/net_error_list.h). */
const MESSAGES: Record<number, string> = {
  [-105]: "L'adresse du site est introuvable (DNS). Vérifiez l'orthographe de l'adresse.",
  [-106]: 'Vous semblez être hors ligne. Vérifiez votre connexion Internet.',
  [-102]: 'Le site a refusé la connexion.',
  [-118]: 'Le site met trop de temps à répondre.',
  [-7]: 'Le site met trop de temps à répondre.',
  [-101]: 'La connexion a été réinitialisée.',
  [-109]: "L'adresse est inaccessible.",
  [-137]: "L'adresse du site est introuvable (DNS).",
  [-200]: "Le certificat de sécurité du site n'est pas valide. La connexion n'est pas privée.",
  [-201]: 'Le certificat de sécurité du site a expiré ou sa date est incorrecte.',
  [-202]: "Le certificat de sécurité du site n'est pas reconnu.",
  [-310]: 'Trop de redirections : la page tourne en boucle.',
  [-324]: 'Le site a renvoyé une réponse vide.'
}

export function ErrorPage({ tab }: { tab: TabState }) {
  const error = tab.error!
  const message = MESSAGES[error.code] ?? 'La page n’a pas pu être chargée.'
  return (
    <div className="flex h-full items-center justify-center bg-zinc-950 p-8">
      <div className="max-w-md text-center">
        <CloudOff className="mx-auto mb-5 h-12 w-12 text-zinc-600" />
        <h1 className="mb-2 text-xl font-semibold text-zinc-100">Impossible d'accéder à {hostOf(error.url)}</h1>
        <p className="mb-1 text-sm leading-relaxed text-zinc-400">{message}</p>
        <p className="mb-6 font-mono text-xs text-zinc-600">{error.description || `Erreur ${error.code}`}</p>
        <button
          type="button"
          onClick={() => void window.api.navigation.reload()}
          className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          <RotateCw className="h-4 w-4" /> Réessayer
        </button>
      </div>
    </div>
  )
}
