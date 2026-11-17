import { useState, type DragEvent } from 'react'
import { Globe, Loader2, Plus, VenetianMask, X } from 'lucide-react'
import type { TabState } from '@shared/types'
import { tabTitle } from '../lib/tabDisplay'

const DRAG_TYPE = 'application/x-second-cerveau-tab'

interface TabStripProps {
  tabs: TabState[]
  activeTabId: number | null
}

export function TabStrip({ tabs, activeTabId }: TabStripProps) {
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const api = window.api.tabs

  const onDrop = (e: DragEvent, index: number) => {
    e.preventDefault()
    setDropIndex(null)
    const id = Number(e.dataTransfer.getData(DRAG_TYPE))
    if (id) void api.move(id, index)
  }

  return (
    <div className="flex h-9 shrink-0 items-end gap-0.5 bg-zinc-950 px-1.5 pt-1.5" role="tablist">
      {tabs.map((tab, index) => (
        <TabItem
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          dropTarget={dropIndex === index}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
            e.preventDefault()
            setDropIndex(index)
          }}
          onDragLeave={() => setDropIndex((i) => (i === index ? null : i))}
          onDrop={(e) => onDrop(e, index)}
        />
      ))}
      <button
        type="button"
        title="Nouvel onglet (Ctrl+T) — onglet privé : Ctrl+Maj+N"
        aria-label="Nouvel onglet"
        onClick={() => void api.create()}
        className="mb-1 ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

interface TabItemProps {
  tab: TabState
  active: boolean
  dropTarget: boolean
  onDragOver(e: DragEvent): void
  onDragLeave(): void
  onDrop(e: DragEvent): void
}

function TabItem({ tab, active, dropTarget, onDragOver, onDragLeave, onDrop }: TabItemProps) {
  const api = window.api.tabs
  const title = tabTitle(tab)

  return (
    <div
      role="tab"
      aria-selected={active}
      title={title}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, String(tab.id))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseDown={(e) => e.button === 0 && void api.activate(tab.id)}
      onAuxClick={(e) => e.button === 1 && void api.close(tab.id)}
      className={`group relative flex h-full min-w-9 max-w-56 flex-1 cursor-default items-center gap-2 rounded-t-lg pl-2.5 pr-1.5 text-xs transition-colors ${
        active
          ? 'bg-zinc-900 text-zinc-100'
          : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
      } ${dropTarget ? 'ring-1 ring-sky-500' : ''}`}
    >
      {tab.isPrivate && (
        <span className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-violet-500" aria-hidden />
      )}
      <TabIcon tab={tab} />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <button
        type="button"
        aria-label="Fermer l'onglet"
        title="Fermer (Ctrl+W)"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => void api.close(tab.id)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-zinc-700 ${
          active ? '' : 'invisible group-hover:visible'
        }`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

function TabIcon({ tab }: { tab: TabState }) {
  const [broken, setBroken] = useState<string | null>(null)

  if (tab.isLoading) return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-400" />
  if (tab.favicon && broken !== tab.favicon) {
    return (
      <img
        src={tab.favicon}
        alt=""
        draggable={false}
        onError={() => setBroken(tab.favicon)}
        className="h-4 w-4 shrink-0"
      />
    )
  }
  if (tab.isPrivate) return <VenetianMask className="h-3.5 w-3.5 shrink-0 text-violet-400" />
  return <Globe className="h-3.5 w-3.5 shrink-0" />
}
