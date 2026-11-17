import { useCallback, useRef, useState } from 'react'
import type { MemorySearchResult } from '@shared/memory'
import { FOCUS_MEMORY_SEARCH_EVENT, MEMORY_SIDEBAR_WIDTH, MemorySidebar } from './components/memory/MemorySidebar'
import { NavigationBar } from './components/NavigationBar'
import { TabStrip } from './components/TabStrip'
import { useChromeInsets } from './hooks/useChromeInsets'
import { useTabs } from './hooks/useTabs'
import { useUiCommand } from './hooks/useUiCommand'
import { isBlankUrl } from './lib/tabDisplay'

export default function App() {
  const { tabs, activeTab } = useTabs()
  const [memoryOpen, setMemoryOpen] = useState(false)
  const topRef = useRef<HTMLElement>(null)
  useChromeInsets(topRef, memoryOpen ? MEMORY_SIDEBAR_WIDTH : 0)

  const closeMemory = useCallback(() => {
    setMemoryOpen(false)
    // Rend le focus à la page web.
    if (activeTab) void window.api.tabs.activate(activeTab.id)
  }, [activeTab])

  const toggleMemory = useCallback(() => {
    if (memoryOpen) closeMemory()
    else setMemoryOpen(true)
  }, [memoryOpen, closeMemory])

  // Ctrl+Maj+K : ouvre la mémoire ; déjà ouverte, ramène le focus sur la recherche (ou ferme si elle l'a).
  useUiCommand('toggle-memory', () => {
    if (!memoryOpen) return setMemoryOpen(true)
    const focusedInSidebar = document.activeElement?.closest('aside[aria-label="Mémoire"]')
    if (focusedInSidebar) closeMemory()
    else window.dispatchEvent(new CustomEvent(FOCUS_MEMORY_SEARCH_EVENT))
  })

  const openResult = (result: MemorySearchResult, background: boolean) => {
    if (!background && activeTab && isBlankUrl(activeTab.url) && !activeTab.isPrivate) {
      void window.api.navigation.navigate(result.url)
    } else {
      void window.api.tabs.create({ url: result.url, activate: !background })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header ref={topRef} className="shrink-0">
        <TabStrip tabs={tabs} activeTabId={activeTab?.id ?? null} />
        <NavigationBar tab={activeTab} memoryOpen={memoryOpen} onToggleMemory={toggleMemory} />
      </header>
      <div className="flex min-h-0 flex-1">
        {/* Zone recouverte par les WebContentsView, positionnées par le Main process. */}
        <main className="flex-1" />
        {memoryOpen && <MemorySidebar onClose={closeMemory} onOpen={openResult} />}
      </div>
    </div>
  )
}
