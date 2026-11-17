import { useEffect, useState } from 'react'
import type { TabState, TabsSnapshot } from '@shared/types'

const EMPTY: TabsSnapshot = { tabs: [], activeTabId: null }

/** Abonne le composant à l'état des onglets poussé par le Main process. */
export function useTabs(): { tabs: TabState[]; activeTab: TabState | null } {
  const [snapshot, setSnapshot] = useState<TabsSnapshot>(EMPTY)

  useEffect(() => {
    let alive = true
    void window.api.tabs.getSnapshot().then((s) => alive && setSnapshot(s))
    const unsubscribe = window.api.tabs.onChanged(setSnapshot)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const activeTab = snapshot.tabs.find((t) => t.id === snapshot.activeTabId) ?? null
  return { tabs: snapshot.tabs, activeTab }
}
