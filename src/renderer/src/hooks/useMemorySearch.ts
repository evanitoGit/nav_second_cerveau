import { useEffect, useRef, useState } from 'react'
import type { MemorySearchResponse, MemorySearchResult, MemoryStats } from '@shared/memory'

const DEBOUNCE_MS = 250

export interface MemorySearchState {
  response: MemorySearchResponse | null
  recent: MemorySearchResult[]
  stats: MemoryStats | null
  loading: boolean
  error: string | null
}

/**
 * Recherche dans la mémoire avec anti-rebond. Les réponses obsolètes (requête modifiée entre-temps)
 * sont ignorées. Les pages récentes et les statistiques se rafraîchissent quand la mémoire change.
 */
export function useMemorySearch(query: string, enabled: boolean): MemorySearchState & { removeLocally(pageId: number): void } {
  const [response, setResponse] = useState<MemorySearchResponse | null>(null)
  const [recent, setRecent] = useState<MemorySearchResult[]>([])
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    if (!enabled) return
    return window.api.memory.onChanged(() => setVersion((v) => v + 1))
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    void window.api.memory.getStats().then((s) => alive && setStats(s))
    void window.api.memory.recent(20).then((r) => alive && setRecent(r))
    return () => {
      alive = false
    }
  }, [enabled, version])

  useEffect(() => {
    const trimmed = query.trim()
    const id = ++seq.current
    if (!enabled || !trimmed) {
      setResponse(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      window.api.memory
        .search(trimmed)
        .then((res) => {
          if (id !== seq.current) return
          setResponse(res)
          setError(null)
        })
        .catch((err: unknown) => {
          if (id === seq.current) setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (id === seq.current) setLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, enabled])

  const removeLocally = (pageId: number) => {
    setRecent((r) => r.filter((x) => x.pageId !== pageId))
    setResponse((res) => (res ? { ...res, results: res.results.filter((x) => x.pageId !== pageId) } : res))
  }

  return { response, recent, stats, loading, error, removeLocally }
}
