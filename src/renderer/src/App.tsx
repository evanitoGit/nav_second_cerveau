import { useEffect, useRef } from 'react'
import { NavigationBar } from './components/NavigationBar'
import { useChromeInsets } from './hooks/useChromeInsets'
import { useNavigationState } from './hooks/useNavigationState'

export default function App() {
  const state = useNavigationState()
  const topRef = useRef<HTMLElement>(null)
  useChromeInsets(topRef)

  useEffect(() => {
    document.title = state.title ? `${state.title} — Second Cerveau` : 'Second Cerveau'
  }, [state.title])

  return (
    <div className="relative flex h-full flex-col">
      <NavigationBar ref={topRef} state={state} />
      {/* Zone recouverte par la WebContentsView, positionnée par le Main process. */}
      <main className="flex-1" />
    </div>
  )
}
