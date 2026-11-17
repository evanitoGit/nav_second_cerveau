import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Globe, Lock, VenetianMask } from 'lucide-react'
import { useUiCommand } from '../hooks/useUiCommand'
import { displayUrl } from '../lib/tabDisplay'

interface AddressBarProps {
  /** Change à chaque changement d'onglet : réinitialise la saisie en cours. */
  tabId: number | null
  url: string
  isPrivate: boolean
  onSubmit(input: string): void
}

export function AddressBar({ tabId, url, isPrivate, onSubmit }: AddressBarProps) {
  const shownUrl = displayUrl(url)
  const [value, setValue] = useState(shownUrl)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // On ne remplace pas la saisie de l'utilisateur pendant qu'il tape…
  useEffect(() => {
    if (!editing) setValue(shownUrl)
  }, [shownUrl, editing])

  // …sauf s'il change d'onglet.
  useEffect(() => {
    setValue(shownUrl)
  }, [tabId])

  // Ctrl+L / F6 / nouvel onglet : envoyé par le Main, même quand la page web a le focus.
  useUiCommand('focus-address-bar', () => {
    inputRef.current?.focus()
    inputRef.current?.select()
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    onSubmit(value)
    setEditing(false)
    inputRef.current?.blur()
  }

  const Icon = isPrivate ? VenetianMask : url.startsWith('https://') ? Lock : Globe

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1">
      <div
        className={`flex h-8 w-full items-center gap-2 rounded-full bg-zinc-800/80 px-3 ring-1 focus-within:ring-2 ${
          isPrivate ? 'ring-violet-700/70 focus-within:ring-violet-500' : 'ring-zinc-700/60 focus-within:ring-sky-500'
        }`}
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${isPrivate ? 'text-violet-400' : 'text-zinc-400'}`} />
        <input
          ref={inputRef}
          value={value}
          spellCheck={false}
          placeholder={isPrivate ? 'Navigation privée — rien ne sera mémorisé' : 'Rechercher sur Google ou saisir une URL'}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => {
            setEditing(true)
            e.target.select()
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setValue(shownUrl)
              e.currentTarget.blur()
            }
          }}
          className="min-w-0 flex-1 select-text bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
      </div>
    </form>
  )
}
