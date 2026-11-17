import { useCallback, useRef, useState } from 'react'
import type { MemorySearchResult } from '@shared/memory'
import { DownloadsPanel, PANEL_WIDTH } from './components/DownloadsPanel'
import { ErrorPage } from './components/ErrorPage'
import { FindBar } from './components/FindBar'
import { FOCUS_MEMORY_SEARCH_EVENT, MemorySidebar } from './components/memory/MemorySidebar'
import { NavigationBar } from './components/NavigationBar'
import { PermissionBar } from './components/PermissionBar'
import { TabStrip } from './components/TabStrip'
import { useChromeInsets } from './hooks/useChromeInsets'
import { useDownloads } from './hooks/useDownloads'
import { usePermissionPrompts } from './hooks/usePermissionPrompts'
import { useTabs } from './hooks/useTabs'
import { useUiCommand } from './hooks/useUiCommand'
import { isBlankUrl } from './lib/tabDisplay'

type Panel = 'memory' | 'downloads' | null

export default function App() {
  const { tabs, activeTab } = useTabs()
  const downloads = useDownloads()
  const prompts = usePermissionPrompts()
  const [panel, setPanel] = useState<Panel>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findTabId, setFindTabId] = useState<number | null>(null)
  const topRef = useRef<HTMLElement>(null)
  useChromeInsets(topRef, panel ? PANEL_WIDTH : 0)

  // Changer d'onglet ferme la recherche dans la page (le Main l'arrête sur l'ancien onglet).
  if (findOpen && activeTab && findTabId !== activeTab.id) {
    setFindOpen(false)
  }

  const focusPage = useCallback(() => {
    if (activeTab) void window.api.tabs.activate(activeTab.id)
  }, [activeTab])

  const closePanel = useCallback(() => {
    setPanel(null)
    focusPage()
  }, [focusPage])

  const togglePanel = (target: Exclude<Panel, null>) => (panel === target ? closePanel() : setPanel(target))

  useUiCommand('toggle-memory', () => {
    if (panel !== 'memory') return setPanel('memory')
    const focusedInSidebar = document.activeElement?.closest('aside[aria-label="Mémoire"]')
    if (focusedInSidebar) closePanel()
    else window.dispatchEvent(new CustomEvent(FOCUS_MEMORY_SEARCH_EVENT))
  })
  useUiCommand('toggle-downloads', () => togglePanel('downloads'))
  useUiCommand('open-find', () => {
    if (!activeTab) return
    if (findOpen) window.dispatchEvent(new CustomEvent('focus-find'))
    setFindTabId(activeTab.id)
    setFindOpen(true)
  })

  const openResult = (result: MemorySearchResult, background: boolean) => {
    if (!background && activeTab && isBlankUrl(activeTab.url) && !activeTab.isPrivate) {
      void window.api.navigation.navigate(result.url)
    } else {
      void window.api.tabs.create({ url: result.url, activate: !background })
    }
  }

  const prompt = prompts.find((p) => p.tabId === activeTab?.id)

  return (
    <div className="flex h-full flex-col">
      <header ref={topRef} className="shrink-0">
        <TabStrip tabs={tabs} activeTabId={activeTab?.id ?? null} />
        <NavigationBar
          tab={activeTab}
          downloads={downloads}
          memoryOpen={panel === 'memory'}
          downloadsOpen={panel === 'downloads'}
          onToggleMemory={() => togglePanel('memory')}
          onToggleDownloads={() => togglePanel('downloads')}
        />
        {prompt && <PermissionBar key={prompt.id} prompt={prompt} />}
        {findOpen && (
          <FindBar
            tabId={activeTab?.id ?? null}
            onClose={() => {
              setFindOpen(false)
              focusPage()
            }}
          />
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        {/* Zone recouverte par les WebContentsView. Visible seulement si la page a échoué. */}
        <main className="min-w-0 flex-1">{activeTab?.error && <ErrorPage tab={activeTab} />}</main>
        {panel === 'memory' && <MemorySidebar onClose={closePanel} onOpen={openResult} />}
        {panel === 'downloads' && <DownloadsPanel downloads={downloads} onClose={closePanel} />}
      </div>
    </div>
  )
}
