import { useEffect, useState } from 'react'
import type { NavigationState } from '@shared/types'

const INITIAL: NavigationState = {
  url: '',
  title: '',
  favicon: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false
}

/** Abonne le composant à l'état de navigation poussé par le Main process. */
export function useNavigationState(): NavigationState {
  const [state, setState] = useState<NavigationState>(INITIAL)

  useEffect(() => {
    let alive = true
    void window.api.navigation.getState().then((s) => alive && setState(s))
    const unsubscribe = window.api.navigation.onStateChanged(setState)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return state
}
