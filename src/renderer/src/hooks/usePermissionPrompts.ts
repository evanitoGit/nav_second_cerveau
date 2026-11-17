import { useEffect, useState } from 'react'
import type { PermissionPrompt } from '@shared/types'

export function usePermissionPrompts(): PermissionPrompt[] {
  const [prompts, setPrompts] = useState<PermissionPrompt[]>([])
  useEffect(() => {
    let alive = true
    void window.api.permissions.list().then((p) => alive && setPrompts(p))
    const off = window.api.permissions.onChanged(setPrompts)
    return () => {
      alive = false
      off()
    }
  }, [])
  return prompts
}
