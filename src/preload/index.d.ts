import type { BrowserApi } from '../shared/ipc'

declare global {
  interface Window {
    api: BrowserApi
  }
}

export {}
