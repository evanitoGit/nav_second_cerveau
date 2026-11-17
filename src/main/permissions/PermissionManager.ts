import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import type { Session, WebContents } from 'electron'
import type { PermissionPrompt } from '@shared/types'

type Decision = 'allow' | 'deny'

/** Accordées sans demander : sans risque pour la vie privée. */
const AUTO_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management'])

/** Soumises à l'utilisateur. Toute autre permission est refusée. */
const PROMPTABLE = new Set(['media', 'notifications', 'geolocation', 'midi', 'midiSysex', 'clipboard-read', 'idle-detection', 'speaker-selection'])

interface Pending {
  prompt: PermissionPrompt
  contents: WebContents
  callbacks: ((granted: boolean) => void)[]
}

/**
 * Autorisations des sites (caméra, micro, notifications, position…).
 * Les décisions sont mémorisées par origine dans permissions.json ; celles prises en navigation
 * privée restent en mémoire et disparaissent à la fermeture du navigateur.
 */
export class PermissionManager extends EventEmitter<{ changed: [PermissionPrompt[]] }> {
  private readonly persistent: Record<string, Record<string, Decision>>
  private readonly ephemeral: Record<string, Record<string, Decision>> = {}
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private saveTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly storePath: string,
    private readonly tabIdOf: (contents: WebContents) => number | null
  ) {
    super()
    this.persistent = loadJson(storePath)
  }

  attach(ses: Session, isPrivate: boolean): void {
    ses.setPermissionRequestHandler((contents, permission, callback, details) => {
      const origin = originOf(details.requestingUrl)
      if (AUTO_ALLOW.has(permission)) return callback(true)
      if (!origin || !PROMPTABLE.has(permission)) return callback(false)

      const mediaTypes = permission === 'media' ? (details as { mediaTypes?: string[] }).mediaTypes ?? [] : []
      const keys = permission === 'media' ? mediaTypes.map((t) => `media:${t}`) : [permission]
      if (keys.length === 0) return callback(false)

      const decisions = keys.map((k) => this.decision(origin, k, isPrivate))
      if (decisions.some((d) => d === 'deny')) return callback(false)
      if (decisions.every((d) => d === 'allow')) return callback(true)
      this.ask(contents, origin, permission, mediaTypes as ('video' | 'audio')[], isPrivate, callback)
    })

    ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
      if (AUTO_ALLOW.has(permission)) return true
      const origin = originOf(requestingOrigin)
      if (!origin) return false
      if (permission === 'media') {
        return ['media:video', 'media:audio'].some((k) => this.decision(origin, k, isPrivate) === 'allow')
      }
      return this.decision(origin, permission, isPrivate) === 'allow'
    })
  }

  list(): PermissionPrompt[] {
    return [...this.pending.values()].map((p) => p.prompt)
  }

  respond(id: number, allow: boolean, remember: boolean): void {
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)
    const { prompt } = entry
    if (remember) {
      const keys = prompt.permission === 'media' ? prompt.mediaTypes.map((t) => `media:${t}`) : [prompt.permission]
      const store = prompt.isPrivate ? this.ephemeral : this.persistent
      store[prompt.origin] ??= {}
      for (const k of keys) store[prompt.origin][k] = allow ? 'allow' : 'deny'
      if (!prompt.isPrivate) this.scheduleSave()
    }
    for (const cb of entry.callbacks) cb(allow)
    this.emitChanged()
  }

  /** Oublie toutes les décisions d'une origine (ou de toutes si `origin` est omis). */
  reset(origin?: string): void {
    for (const store of [this.persistent, this.ephemeral]) {
      for (const key of Object.keys(store)) if (!origin || key === origin) delete store[key]
    }
    this.scheduleSave()
  }

  private decision(origin: string, key: string, isPrivate: boolean): Decision | undefined {
    return (isPrivate ? this.ephemeral : this.persistent)[origin]?.[key]
  }

  private ask(
    contents: WebContents,
    origin: string,
    permission: string,
    mediaTypes: ('video' | 'audio')[],
    isPrivate: boolean,
    callback: (granted: boolean) => void
  ): void {
    const tabId = this.tabIdOf(contents)
    if (tabId === null) return callback(false)

    // Même demande déjà en attente pour cet onglet : on regroupe.
    for (const p of this.pending.values()) {
      if (p.contents === contents && p.prompt.origin === origin && p.prompt.permission === permission) {
        p.callbacks.push(callback)
        return
      }
    }

    const id = this.nextId++
    this.pending.set(id, {
      prompt: { id, tabId, origin, permission, mediaTypes, isPrivate },
      contents,
      callbacks: [callback]
    })
    // La page change ou l'onglet ferme : la demande devient caduque (refus).
    const expire = () => {
      if (!this.pending.has(id)) return
      const entry = this.pending.get(id)!
      this.pending.delete(id)
      for (const cb of entry.callbacks) cb(false)
      this.emitChanged()
    }
    contents.once('did-start-navigation', (details) => details.isMainFrame && !details.isSameDocument && expire())
    contents.once('destroyed', expire)
    this.emitChanged()
  }

  private emitChanged(): void {
    this.emit('changed', this.list())
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      const tmp = `${this.storePath}.tmp`
      void writeFile(tmp, JSON.stringify(this.persistent, null, 2))
        .then(() => rename(tmp, this.storePath))
        .catch((err) => console.warn('[permissions] sauvegarde impossible', err))
    }, 500)
  }
}

function originOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

function loadJson(path: string): Record<string, Record<string, Decision>> {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    return typeof data === 'object' && data !== null ? data : {}
  } catch {
    return {}
  }
}
