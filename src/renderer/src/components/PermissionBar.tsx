import { useState } from 'react'
import { Bell, Camera, Clipboard, MapPin, Mic, Music, ShieldQuestion } from 'lucide-react'
import type { PermissionPrompt } from '@shared/types'

function describe(prompt: PermissionPrompt): { label: string; Icon: typeof Bell } {
  switch (prompt.permission) {
    case 'media': {
      const video = prompt.mediaTypes.includes('video')
      const audio = prompt.mediaTypes.includes('audio')
      return {
        label: video && audio ? 'votre caméra et votre micro' : video ? 'votre caméra' : 'votre micro',
        Icon: video ? Camera : Mic
      }
    }
    case 'notifications':
      return { label: 'vous envoyer des notifications', Icon: Bell }
    case 'geolocation':
      return { label: 'connaître votre position', Icon: MapPin }
    case 'clipboard-read':
      return { label: 'lire votre presse-papiers', Icon: Clipboard }
    case 'midi':
    case 'midiSysex':
      return { label: 'accéder à vos appareils MIDI', Icon: Music }
    default:
      return { label: `utiliser « ${prompt.permission} »`, Icon: ShieldQuestion }
  }
}

/** Demande d'autorisation d'un site, affichée sous la barre d'adresse (comme dans Chrome). */
export function PermissionBar({ prompt }: { prompt: PermissionPrompt }) {
  const [remember, setRemember] = useState(true)
  const { label, Icon } = describe(prompt)
  const host = prompt.origin.replace(/^https?:\/\//, '')
  const respond = (allow: boolean) => void window.api.permissions.respond(prompt.id, allow, remember)
  const verb = prompt.permission === 'media' ? 'souhaite utiliser' : 'souhaite'

  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-3 border-b border-zinc-800 bg-sky-950/60 px-4 py-1.5 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-sky-300" />
      <span className="min-w-0 flex-1 text-zinc-200">
        <strong className="font-semibold text-white">{host}</strong> {verb} {label}.
      </span>
      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-sky-500" />
        {prompt.isPrivate ? 'Pour cette session' : 'Se souvenir de ce choix'}
      </label>
      <button
        type="button"
        onClick={() => respond(false)}
        className="rounded-md px-3 py-1 text-zinc-200 ring-1 ring-zinc-600 hover:bg-zinc-800"
      >
        Bloquer
      </button>
      <button type="button" onClick={() => respond(true)} className="rounded-md bg-sky-600 px-3 py-1 font-medium text-white hover:bg-sky-500">
        Autoriser
      </button>
    </div>
  )
}
