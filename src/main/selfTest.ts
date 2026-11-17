import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoryService } from './memory/MemoryService'

/**
 * Autotest du binaire installé, lancé par la CI sur Windows et Linux :
 *   second-cerveau --self-test [--self-test-report=rapport.json]
 * Vérifie, sans fenêtre, toute la chaîne native : worker threads depuis app.asar, node:sqlite +
 * sqlite-vec, encodage WebP (sharp), modèle d'embeddings réel (Transformers.js + onnxruntime),
 * recherche hybride. Code de sortie 0 si tout passe.
 * Variable optionnelle : SECOND_CERVEAU_MODELS_DIR (cache du modèle, pour la CI).
 */
export async function runSelfTest(): Promise<number> {
  const started = Date.now()
  const report: { ok: boolean; platform: string; electron: string; steps: { name: string; ok: boolean; detail?: unknown }[] } = {
    ok: false,
    platform: `${process.platform}-${process.arch}`,
    electron: process.versions.electron,
    steps: []
  }
  const dir = mkdtempSync(join(tmpdir(), 'second-cerveau-selftest-'))
  const memory = new MemoryService(dir, process.env['SECOND_CERVEAU_MODELS_DIR'] || join(dir, 'models'))

  const step = async <T>(name: string, fn: () => Promise<T>, check: (v: T) => boolean = () => true) => {
    try {
      const value = await fn()
      const ok = check(value)
      report.steps.push({ name, ok, detail: value })
      if (!ok) throw new Error(`échec : ${name}`)
      return value
    } catch (err) {
      if (!report.steps.some((s) => s.name === name)) {
        report.steps.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) })
      }
      throw err
    }
  }

  try {
    await step('base SQLite + sqlite-vec (worker)', () => memory.start().then(() => memory.stats()))
    await step('encodeur WebP (sharp)', async () => memory.canEncodeWebp, (v) => v === true)

    const width = 64
    const height = 40
    const pixels = new Uint8Array(width * height * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7) % 256))
    const pages = [
      {
        url: 'https://example.test/sql',
        title: 'Optimiser les requêtes SQL avec des index',
        text: "Les index B-tree accélèrent les recherches sur les colonnes filtrées. La commande EXPLAIN ANALYZE montre le plan d'exécution de PostgreSQL et révèle les parcours séquentiels coûteux.\n\nUn index composite bien choisi divise par dix le temps de réponse des requêtes de reporting."
      },
      {
        url: 'https://example.test/gratin',
        title: 'Recette du gratin dauphinois',
        text: "Éplucher les pommes de terre et les couper en fines rondelles. Frotter le plat avec une gousse d'ail, ajouter la crème et le lait, puis cuire au four une heure à 160 degrés jusqu'à obtenir une croûte dorée."
      }
    ]
    for (const p of pages) {
      const data = new ArrayBuffer(pixels.length)
      new Uint8Array(data).set(pixels)
      await memory.ingest({
        url: p.url,
        visitedAt: Date.now(),
        content: { title: p.title, siteName: 'Test', byline: null, excerpt: null, lang: 'fr', text: p.text },
        screenshot: { kind: 'bgra', width, height, data }
      })
    }
    await step('enregistrement des pages', () => memory.stats(), (s) => s.pages === 2)

    await step('capture WebP écrite', async () => {
      const header = readFileSync(join(memory.screenshotsDir, '1.webp')).subarray(0, 12).toString('latin1')
      return header
    }, (h) => h.startsWith('RIFF') && h.endsWith('WEBP'))

    await step(
      'modèle d’embeddings (téléchargement + onnxruntime)',
      async () => {
        const deadline = Date.now() + 10 * 60 * 1000
        for (;;) {
          const stats = await memory.stats()
          if (stats.embeddedChunks >= 2 && stats.pendingPages === 0) return stats
          if (stats.embeddingModel.status === 'error') throw new Error(stats.embeddingModel.error)
          if (Date.now() > deadline) throw new Error('délai dépassé')
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
    )

    const related = await step(
      'recherche par le sens (sans mot commun)',
      () => memory.search('accélérer une base de données lente'),
      (r) => r.semantic === 'used' && r.results[0]?.url === 'https://example.test/sql'
    )
    await step(
      'recherche par mots-clés',
      () => memory.search('pommes de terre'),
      (r) => r.results[0]?.url === 'https://example.test/gratin'
    )
    const unrelated = await memory.search('itinéraire de randonnée en montagne')
    report.steps.push({
      name: 'calibrage : requête sans rapport (info)',
      ok: true,
      detail: unrelated.results.map((x) => ({ url: x.url, distance: x.semanticDistance }))
    })
    report.steps.push({
      name: 'calibrage : requête liée (info)',
      ok: true,
      detail: related.results.map((x) => ({ url: x.url, distance: x.semanticDistance }))
    })
    await step('oubli d’une page', () => memory.deletePage(2), (v) => v === true)
    report.ok = true
  } catch (err) {
    console.error('[self-test]', err)
  } finally {
    await memory.dispose().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }

  const text = JSON.stringify({ ...report, durationMs: Date.now() - started }, null, 2)
  console.log(text)
  const target = process.argv.find((a) => a.startsWith('--self-test-report='))?.split('=')[1]
  if (target) writeFileSync(target, text)
  return report.ok ? 0 : 1
}
