import type { DatabaseSync } from 'node:sqlite'
import { HIGHLIGHT_END, HIGHLIGHT_START } from '@shared/memory'
import { RRF_K, SEARCH_CANDIDATES, SEMANTIC_MAX_DISTANCE, SEMANTIC_RELATIVE_MARGIN } from './config'

export interface SearchParams {
  /** Requête FTS5 déjà assainie (voir queryParser), vide = pas de recherche plein texte. */
  fts: string
  /** Vecteur de la requête (normalisé), null = pas de recherche sémantique. */
  vector: Float32Array | null
  range: { from: number; to: number } | null
  limit: number
}

export interface PageHit {
  pageId: number
  url: string
  title: string
  siteName: string | null
  snippet: string
  screenshotFile: string | null
  lastVisitedAt: number
  visitCount: number
  matchedBy: { keywords: boolean; semantic: boolean }
}

interface Candidate {
  pageId: number
  rrf: number
  ftsSnippet?: string
  chunkText?: string
  keywords: boolean
  semantic: boolean
}

/** Page visitée dans la période : une visite enregistrée, ou la dernière visite (visites dédoublonnées). */
const IN_RANGE = `(
  (p.last_visited_at >= :from AND p.last_visited_at < :to) OR
  EXISTS (SELECT 1 FROM visits v WHERE v.page_id = p.id AND v.visited_at >= :from AND v.visited_at < :to)
)`

/**
 * Recherche hybride :
 *  1. plein texte FTS5 classé par BM25 (titre ×8, URL ×2, contenu ×1) ;
 *  2. k plus proches voisins sur les vecteurs des chunks (sqlite-vec, cosinus), meilleur chunk par page ;
 *  3. fusion des deux classements par Reciprocal Rank Fusion : score = Σ 1 / (k + rang).
 * La RRF ne compare que des rangs : pas besoin de normaliser BM25 et distances cosinus entre eux.
 */
export function hybridSearch(db: DatabaseSync, params: SearchParams): PageHit[] {
  const candidates = new Map<number, Candidate>()
  const rangeArgs: Record<string, number> = params.range ? { from: params.range.from, to: params.range.to } : {}
  const rangeSql = params.range ? `AND ${IN_RANGE}` : ''

  const add = (pageId: number, rank: number, patch: Partial<Candidate>) => {
    const c = candidates.get(pageId) ?? { pageId, rrf: 0, keywords: false, semantic: false }
    c.rrf += 1 / (RRF_K + rank)
    Object.assign(c, patch)
    candidates.set(pageId, c)
  }

  if (params.fts) {
    const rows = db
      .prepare(
        `SELECT p.id AS pageId,
                snippet(pages_fts, 1, :hs, :he, '…', 24) AS snippet
         FROM pages_fts JOIN pages p ON p.id = pages_fts.rowid
         WHERE pages_fts MATCH :q ${rangeSql}
         ORDER BY bm25(pages_fts, 8.0, 1.0, 2.0)
         LIMIT :limit`
      )
      .all({ q: params.fts, hs: HIGHLIGHT_START, he: HIGHLIGHT_END, limit: SEARCH_CANDIDATES, ...rangeArgs }) as {
      pageId: number
      snippet: string
    }[]
    rows.forEach((r, i) => add(r.pageId, i + 1, { keywords: true, ftsSnippet: r.snippet }))
  }

  if (params.vector) {
    // Plus de voisins que de pages voulues : plusieurs chunks d'une même page peuvent sortir.
    // MIN() en agrégat : SQLite renvoie les colonnes « nues » (c.text) de la ligne du minimum.
    const rows = db
      .prepare(
        `SELECT c.page_id AS pageId, c.text AS text, MIN(knn.distance) AS distance
         FROM (SELECT chunk_id, distance FROM chunk_vectors WHERE embedding MATCH :v AND k = :k) knn
         JOIN chunks c ON c.id = knn.chunk_id
         JOIN pages p ON p.id = c.page_id
         WHERE 1 = 1 ${rangeSql}
         GROUP BY c.page_id
         ORDER BY distance
         LIMIT :limit`
      )
      .all({ v: params.vector, k: SEARCH_CANDIDATES * 4, limit: SEARCH_CANDIDATES, ...rangeArgs }) as {
      pageId: number
      text: string
      distance: number
    }[]
    const cutoff = Math.min(SEMANTIC_MAX_DISTANCE, (rows[0]?.distance ?? 0) + SEMANTIC_RELATIVE_MARGIN)
    rows
      .filter((r) => r.distance <= cutoff)
      .forEach((r, i) => add(r.pageId, i + 1, { semantic: true, chunkText: r.text }))
  }

  const ranked = [...candidates.values()].sort((a, b) => b.rrf - a.rrf).slice(0, params.limit)
  return hydrate(db, ranked)
}

/** Pages les plus récemment visitées (requête vide, ou purement temporelle comme « hier »). */
export function recentPages(db: DatabaseSync, range: { from: number; to: number } | null, limit: number): PageHit[] {
  const rangeArgs: Record<string, number> = range ? { from: range.from, to: range.to } : {}
  const rows = db
    .prepare(
      `SELECT p.id AS pageId FROM pages p
       WHERE 1 = 1 ${range ? `AND ${IN_RANGE}` : ''}
       ORDER BY p.last_visited_at DESC LIMIT :limit`
    )
    .all({ limit, ...rangeArgs }) as { pageId: number }[]
  return hydrate(
    db,
    rows.map((r) => ({ pageId: r.pageId, rrf: 0, keywords: false, semantic: false }))
  )
}

function hydrate(db: DatabaseSync, candidates: Candidate[]): PageHit[] {
  const stmt = db.prepare(
    `SELECT url, title, site_name, excerpt, content, screenshot_file, last_visited_at, visit_count
     FROM pages WHERE id = ?`
  )
  return candidates.flatMap((c) => {
    const p = stmt.get(c.pageId) as
      | {
          url: string
          title: string
          site_name: string | null
          excerpt: string | null
          content: string
          screenshot_file: string | null
          last_visited_at: number
          visit_count: number
        }
      | undefined
    if (!p) return []
    return [
      {
        pageId: c.pageId,
        url: p.url,
        title: p.title,
        siteName: p.site_name,
        snippet: pickSnippet(c, p.excerpt, p.content),
        screenshotFile: p.screenshot_file,
        lastVisitedAt: p.last_visited_at,
        visitCount: p.visit_count,
        matchedBy: { keywords: c.keywords, semantic: c.semantic }
      }
    ]
  })
}

/** Extrait FTS surligné si dispo, sinon le passage le plus proche sémantiquement, sinon le résumé. */
function pickSnippet(c: Candidate, excerpt: string | null, content: string): string {
  if (c.ftsSnippet && c.ftsSnippet.includes(HIGHLIGHT_START)) return c.ftsSnippet
  const source = c.chunkText ?? excerpt ?? content
  const clean = source.replace(/\s+/g, ' ').trim()
  return clean.length > 280 ? `${clean.slice(0, 280).replace(/\s+\S*$/, '')}…` : clean
}
