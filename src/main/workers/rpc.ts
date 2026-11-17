import { parentPort, Worker, type TransferListItem } from 'node:worker_threads'

/**
 * Mini-RPC typé entre le Main process et ses worker threads.
 * Une API de worker est décrite par une interface `{ méthode(params): résultat }`.
 */
// Accepte aussi les interfaces TypeScript (qui n'ont pas de signature d'index).
type AnyApi<Api> = { [K in keyof Api]: (params: never) => unknown }
type Params<F> = F extends (params: infer P) => unknown ? P : never
type Result<F> = F extends (params: never) => infer R ? Awaited<R> : never

interface RpcRequest {
  id: number
  method: string
  params: unknown
}
type RpcResponse = { id: number; result: unknown } | { id: number; error: string }

/** Résultat accompagné de buffers à transférer (sans copie) vers l'autre thread. */
export class Transferable<T> {
  constructor(
    readonly value: T,
    readonly transfer: TransferListItem[]
  ) {}
}

// ---------------------------------------------------------------------------
// Côté Main
// ---------------------------------------------------------------------------

export class WorkerClient<Api extends AnyApi<Api>> {
  private worker: Worker | null = null
  private nextId = 1
  private readonly pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>()
  private restarts = 0
  private disposed = false
  private startup: Promise<void> | null = null

  /**
   * @param name     nom pour les logs
   * @param spawn    crée le Worker
   * @param onStart  appelé après chaque (re)démarrage, ex. pour envoyer `init`
   */
  constructor(
    private readonly name: string,
    private readonly spawn: () => Worker,
    private readonly onStart?: (client: WorkerClient<Api>) => Promise<void>,
    private readonly maxRestarts = 3
  ) {}

  async call<K extends keyof Api & string>(
    method: K,
    params: Params<Api[K]>,
    transfer: TransferListItem[] = []
  ): Promise<Result<Api[K]>> {
    await this.ensureStarted()
    return this.send(method, params, transfer) as Promise<Result<Api[K]>>
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const worker = this.worker
    this.worker = null
    this.rejectAll(new Error(`${this.name} arrêté`))
    await worker?.terminate()
  }

  private send(method: string, params: unknown, transfer: TransferListItem[]): Promise<unknown> {
    const worker = this.worker
    if (!worker) return Promise.reject(new Error(`${this.name} indisponible`))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      worker.postMessage({ id, method, params } satisfies RpcRequest, transfer)
    })
  }

  private ensureStarted(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error(`${this.name} arrêté`))
    if (this.worker && this.startup) return this.startup
    if (this.restarts > this.maxRestarts) return Promise.reject(new Error(`${this.name} : trop de plantages`))

    const worker = this.spawn()
    this.worker = worker
    worker.on('message', (msg: RpcResponse) => {
      const entry = this.pending.get(msg.id)
      if (!entry) return
      this.pending.delete(msg.id)
      if ('error' in msg) entry.reject(new Error(msg.error))
      else entry.resolve(msg.result)
    })
    worker.on('error', (err) => console.error(`[${this.name}] erreur`, err))
    worker.on('exit', (code) => {
      if (this.worker !== worker) return
      this.worker = null
      this.startup = null
      this.rejectAll(new Error(`${this.name} s'est arrêté (code ${code})`))
      if (!this.disposed) {
        this.restarts++
        console.warn(`[${this.name}] arrêt inattendu (code ${code}), redémarrage au prochain appel`)
      }
    })

    // Les appels faits pendant onStart (ex. `init`) passent directement par send().
    this.startup = (this.onStart?.(this) ?? Promise.resolve()).catch((err) => {
      console.error(`[${this.name}] échec d'initialisation`, err)
      throw err
    })
    return this.startup
  }

  /** Utilisé uniquement dans `onStart` : appel sans attendre la fin du démarrage. */
  callDuringStartup<K extends keyof Api & string>(method: K, params: Params<Api[K]>): Promise<Result<Api[K]>> {
    return this.send(method, params, []) as Promise<Result<Api[K]>>
  }

  private rejectAll(err: Error): void {
    for (const { reject } of this.pending.values()) reject(err)
    this.pending.clear()
  }
}

// ---------------------------------------------------------------------------
// Côté worker
// ---------------------------------------------------------------------------

type Handlers<Api extends AnyApi<Api>> = {
  [K in keyof Api]: (params: Params<Api[K]>) => Promise<Result<Api[K]> | Transferable<Result<Api[K]>>> | Result<Api[K]> | Transferable<Result<Api[K]>>
}

/** Sert les requêtes du Main. Les appels sont traités un par un, dans l'ordre d'arrivée. */
export function serve<Api extends AnyApi<Api>>(handlers: Handlers<Api>): void {
  const port = parentPort
  if (!port) throw new Error('serve() doit être appelé dans un worker thread')

  let queue: Promise<void> = Promise.resolve()
  port.on('message', (req: RpcRequest) => {
    queue = queue.then(async () => {
      const handler = (handlers as Record<string, (p: unknown) => unknown>)[req.method]
      try {
        if (!handler) throw new Error(`méthode inconnue : ${req.method}`)
        const out = await handler(req.params)
        if (out instanceof Transferable) port.postMessage({ id: req.id, result: out.value }, out.transfer)
        else port.postMessage({ id: req.id, result: out })
      } catch (err) {
        port.postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) })
      }
    })
  })
}
