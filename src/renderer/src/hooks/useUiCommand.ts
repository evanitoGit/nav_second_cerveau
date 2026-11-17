import { useEffect, useRef } from 'react'
import type { UiCommand } from '@shared/types'

/** Exécute `handler` quand le Main envoie la commande donnée (ex. raccourci Ctrl+L). */
export function useUiCommand(command: UiCommand, handler: () => void): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(
    () => window.api.ui.onCommand((received) => received === command && handlerRef.current()),
    [command]
  )
}
