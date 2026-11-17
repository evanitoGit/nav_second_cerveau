import { useRef } from 'react'
import { NavigationBar } from './components/NavigationBar'
import { TabStrip } from './components/TabStrip'
import { useChromeInsets } from './hooks/useChromeInsets'
import { useTabs } from './hooks/useTabs'

export default function App() {
  const { tabs, activeTab } = useTabs()
  const topRef = useRef<HTMLElement>(null)
  useChromeInsets(topRef)

  return (
    <div className="flex h-full flex-col">
      <header ref={topRef} className="shrink-0">
        <TabStrip tabs={tabs} activeTabId={activeTab?.id ?? null} />
        <NavigationBar tab={activeTab} />
      </header>
      {/* Zone recouverte par les WebContentsView, positionnées par le Main process. */}
      <main className="flex-1" />
    </div>
  )
}
