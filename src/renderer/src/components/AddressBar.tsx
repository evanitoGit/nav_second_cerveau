import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Globe, Lock } from 'lucide-react'

interface AddressBarProps {
  url: string
  favicon: string | null
  onSubmit(input: string): void
}

export function AddressBar({ url, favicon, onSubmit }: AddressBarProps) {
  const [value, setValue] = useState(url)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // On ne remplace pas la saisie de l'utilisateur pendant qu'il tape.
  useEffect(() => {
    if (!editing) setValue(url)
  }, [url, editing])

  // Ctrl/Cmd+L : focus sur la barre d'adresse (quand l'UI a le focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    onSubmit(value)
    setEditing(false)
    inputRef.current?.blur()
  }

  const isSecure = url.startsWith('https://')

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1">
      <div className="flex h-8 w-full items-center gap-2 rounded-full bg-zinc-800/80 px-3 ring-1 ring-zinc-700/60 focus-within:ring-2 focus-within:ring-sky-500">
        {favicon ? (
          <img src={favicon} alt="" className="h-4 w-4 shrink-0" draggable={false} />
        ) : isSecure ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        ) : (
          <Globe className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        )}
        <input
          ref={inputRef}
          value={value}
          spellCheck={false}
          placeholder="Rechercher sur Google ou saisir une URL"
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => {
            setEditing(true)
            e.target.select()
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setValue(url)
              e.currentTarget.blur()
            }
          }}
          className="min-w-0 flex-1 select-text bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
      </div>
    </form>
  )
}
