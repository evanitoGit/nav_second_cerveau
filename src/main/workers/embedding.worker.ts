/**
 * Worker « embeddings » : charge le modèle (Transformers.js + onnxruntime) et vectorise du texte.
 * Isolé dans son propre thread : l'inférence ne ralentit ni l'UI ni la base de données.
 */
import { EMBEDDING_BATCH_SIZE, EMBEDDING_DIMS } from '../memory/config'
import { serve, Transferable } from './rpc'
import type { EmbeddingWorkerApi } from './types'

type Embedder = (texts: string[]) => Promise<Float32Array>

let config: { modelId: string; cacheDir: string; fake: boolean } | null = null
let embedderPromise: Promise<Embedder> | null = null

/** Chargement paresseux : le modèle (~120 Mo) n'est téléchargé/chargé qu'au premier besoin. */
function getEmbedder(): Promise<Embedder> {
  if (!config) return Promise.reject(new Error('worker embeddings non initialisé'))
  embedderPromise ??= (config.fake ? Promise.resolve(fakeEmbedder) : loadModel(config)).catch((err) => {
    embedderPromise = null // nouvel essai au prochain appel (ex. réseau revenu)
    throw err
  })
  return embedderPromise
}

async function loadModel({ modelId, cacheDir }: { modelId: string; cacheDir: string }): Promise<Embedder> {
  const { env, pipeline } = await import('@huggingface/transformers')
  env.cacheDir = cacheDir
  env.allowLocalModels = false
  const extractor = await pipeline('feature-extraction', modelId, { dtype: 'q8' })
  return async (texts) => {
    const output = await extractor(texts, { pooling: 'mean', normalize: true })
    return output.data as Float32Array
  }
}

/**
 * Embeddings factices (sac de mots haché) pour les tests sans accès au modèle.
 * Activés uniquement par la variable d'environnement SECOND_CERVEAU_FAKE_EMBEDDINGS=1.
 */
async function fakeEmbedder(texts: string[]): Promise<Float32Array> {
  const out = new Float32Array(texts.length * EMBEDDING_DIMS)
  texts.forEach((text, t) => {
    const v = out.subarray(t * EMBEDDING_DIMS, (t + 1) * EMBEDDING_DIMS)
    for (const word of text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/\p{L}{3,}/gu) ?? []) {
      let h = 2166136261
      for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619)
      v[(h >>> 0) % EMBEDDING_DIMS] += 1
    }
    const norm = Math.hypot(...v) || 1
    for (let i = 0; i < v.length; i++) v[i] /= norm
  })
  return out
}

serve<EmbeddingWorkerApi>({
  init(params) {
    config = params
  },

  async embed({ texts, kind }) {
    const embed = await getEmbedder()
    const out = new Float32Array(texts.length * EMBEDDING_DIMS)
    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      // Préfixes attendus par les modèles e5.
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE).map((t) => `${kind}: ${t}`)
      const vectors = await embed(batch)
      if (vectors.length !== batch.length * EMBEDDING_DIMS) {
        throw new Error(`le modèle renvoie ${vectors.length / batch.length} dimensions, ${EMBEDDING_DIMS} attendues`)
      }
      out.set(vectors, i * EMBEDDING_DIMS)
    }
    return new Transferable({ vectors: out, dims: EMBEDDING_DIMS }, [out.buffer])
  }
})
