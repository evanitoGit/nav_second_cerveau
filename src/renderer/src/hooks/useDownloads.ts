import { useEffect, useState } from 'react'
import type { DownloadState } from '@shared/types'

export function useDownloads(): DownloadState[] {
  const [downloads, setDownloads] = useState<DownloadState[]>([])
  useEffect(() => {
    let alive = true
    void window.api.downloads.list().then((d) => alive && setDownloads(d))
    const off = window.api.downloads.onChanged(setDownloads)
    return () => {
      alive = false
      off()
    }
  }, [])
  return downloads
}
