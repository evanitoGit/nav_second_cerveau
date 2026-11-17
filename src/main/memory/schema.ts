import { EMBEDDING_DIMS } from './config'

/**
 * Migrations successives, appliquées dans l'ordre selon `PRAGMA user_version`.
 * Ne jamais modifier une migration déjà publiée : en ajouter une nouvelle.
 */
export const MIGRATIONS: string[] = [
  /* v1 */ `
  CREATE TABLE pages (
    id                INTEGER PRIMARY KEY,
    url               TEXT    NOT NULL UNIQUE,
    title             TEXT    NOT NULL,
    site_name         TEXT,
    byline            TEXT,
    excerpt           TEXT,
    lang              TEXT,
    content           TEXT    NOT NULL,
    content_hash      TEXT    NOT NULL,
    screenshot_file   TEXT,
    first_visited_at  INTEGER NOT NULL,
    last_visited_at   INTEGER NOT NULL,
    visit_count       INTEGER NOT NULL DEFAULT 1,
    captured_at       INTEGER NOT NULL,
    embedding_status  TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (embedding_status IN ('pending', 'done', 'error')),
    embedding_model   TEXT
  );
  CREATE INDEX pages_last_visited ON pages(last_visited_at DESC);
  CREATE INDEX pages_embedding_status ON pages(embedding_status);

  CREATE TABLE visits (
    id          INTEGER PRIMARY KEY,
    page_id     INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    visited_at  INTEGER NOT NULL
  );
  CREATE INDEX visits_page ON visits(page_id, visited_at DESC);

  CREATE TABLE chunks (
    id       INTEGER PRIMARY KEY,
    page_id  INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    ord      INTEGER NOT NULL,
    text     TEXT    NOT NULL,
    UNIQUE (page_id, ord)
  );

  -- Recherche plein texte (BM25), insensible aux accents.
  CREATE VIRTUAL TABLE pages_fts USING fts5(
    title, content, url,
    content = 'pages', content_rowid = 'id',
    tokenize = 'unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER pages_fts_ai AFTER INSERT ON pages BEGIN
    INSERT INTO pages_fts(rowid, title, content, url) VALUES (new.id, new.title, new.content, new.url);
  END;
  CREATE TRIGGER pages_fts_ad AFTER DELETE ON pages BEGIN
    INSERT INTO pages_fts(pages_fts, rowid, title, content, url) VALUES ('delete', old.id, old.title, old.content, old.url);
  END;
  CREATE TRIGGER pages_fts_au AFTER UPDATE OF title, content, url ON pages BEGIN
    INSERT INTO pages_fts(pages_fts, rowid, title, content, url) VALUES ('delete', old.id, old.title, old.content, old.url);
    INSERT INTO pages_fts(rowid, title, content, url) VALUES (new.id, new.title, new.content, new.url);
  END;

  -- Vecteurs des chunks (sqlite-vec), distance cosinus. Pas de cascade : nettoyés à la main.
  CREATE VIRTUAL TABLE chunk_vectors USING vec0(
    chunk_id INTEGER PRIMARY KEY,
    embedding float[${EMBEDDING_DIMS}] distance_metric=cosine
  );
  `
]
