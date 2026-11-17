import type { Input, WebContents } from 'electron'

export type ShortcutAction =
  | { type: 'new-tab' }
  | { type: 'new-private-tab' }
  | { type: 'close-tab' }
  | { type: 'reopen-closed-tab' }
  | { type: 'next-tab' }
  | { type: 'previous-tab' }
  | { type: 'select-tab'; index: number } // -1 = dernier
  | { type: 'focus-address-bar' }
  | { type: 'reload' }
  | { type: 'hard-reload' }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'toggle-devtools' }
  | { type: 'toggle-memory' }
  | { type: 'find' }
  | { type: 'zoom'; direction: 'in' | 'out' | 'reset' }
  | { type: 'print' }
  | { type: 'toggle-downloads' }
  | { type: 'toggle-settings' }

const isMac = process.platform === 'darwin'

/**
 * Traduit une frappe clavier en action du navigateur.
 * Les chiffres utilisent `input.code` (position physique) pour fonctionner aussi en AZERTY.
 */
export function matchShortcut(input: Input): ShortcutAction | null {
  if (input.type !== 'keyDown') return null
  const mod = isMac ? input.meta : input.control
  const key = input.key.toLowerCase()

  if (input.control && key === 'tab') return { type: input.shift ? 'previous-tab' : 'next-tab' }
  if (input.control && !input.shift && key === 'pagedown') return { type: 'next-tab' }
  if (input.control && !input.shift && key === 'pageup') return { type: 'previous-tab' }

  if (mod && !input.alt) {
    // Zoom : testé sur la touche produite (en AZERTY, « - » est sur la touche 6).
    if (input.key === '+' || input.key === '=' || input.code === 'NumpadAdd') return { type: 'zoom', direction: 'in' }
    if (input.key === '-' || input.code === 'NumpadSubtract') return { type: 'zoom', direction: 'out' }
    if (input.code === 'Digit0' || input.code === 'Numpad0') return { type: 'zoom', direction: 'reset' }

    const digit = /^Digit([1-9])$/.exec(input.code)?.[1]
    if (digit && !input.shift) return { type: 'select-tab', index: digit === '9' ? -1 : Number(digit) - 1 }

    switch (key) {
      case 't':
        return { type: input.shift ? 'reopen-closed-tab' : 'new-tab' }
      case 'n':
        return input.shift ? { type: 'new-private-tab' } : null
      case 'w':
      case 'f4':
        return input.shift ? null : { type: 'close-tab' }
      case 'l':
        return { type: 'focus-address-bar' }
      case 'r':
        return { type: input.shift ? 'hard-reload' : 'reload' }
      case 'i':
        return input.shift ? { type: 'toggle-devtools' } : null
      case 'k':
        return input.shift ? { type: 'toggle-memory' } : null
      case 'f':
        return input.shift ? null : { type: 'find' }
      case 'p':
        return input.shift ? null : { type: 'print' }
      case 'j':
        return { type: 'toggle-downloads' }
      case ',':
        return { type: 'toggle-settings' }
      case '[':
        return isMac ? { type: 'back' } : null
      case ']':
        return isMac ? { type: 'forward' } : null
      case 'arrowleft':
        return isMac ? { type: 'back' } : null
      case 'arrowright':
        return isMac ? { type: 'forward' } : null
    }
  }

  if (!isMac && input.alt && !input.control && !input.shift) {
    if (key === 'arrowleft') return { type: 'back' }
    if (key === 'arrowright') return { type: 'forward' }
    if (key === 'd') return { type: 'focus-address-bar' }
  }

  if (!mod && !input.alt) {
    if (key === 'f5') return { type: input.shift ? 'hard-reload' : 'reload' }
    if (key === 'f6') return { type: 'focus-address-bar' }
    if (key === 'f12') return { type: 'toggle-devtools' }
  }

  return null
}

/**
 * Intercepte les raccourcis avant qu'ils n'atteignent la page (ou l'UI).
 * Nécessaire car une WebContentsView qui a le focus reçoit les frappes à la place de l'UI.
 */
export function attachShortcuts(contents: WebContents, handler: (action: ShortcutAction) => void): void {
  contents.on('before-input-event', (event, input) => {
    const action = matchShortcut(input)
    if (!action) return
    event.preventDefault()
    handler(action)
  })
}
