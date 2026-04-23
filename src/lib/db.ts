/**
 * PostgreSQL connection pool.
 * Uses DATABASE_URL env var (set by Railway automatically).
 * Falls back gracefully if not configured — storage.ts handles the fallback.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pool = any;

let pool: Pool | null = null;

export const getPool = (): Pool | null => {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    // Dynamic require so the module doesn't crash when pg isn't installed (local dev without DB)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool: PgPool } = require("pg");
    pool = new PgPool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("railway")
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
};

/**
 * Run DB migrations — create tables if they don't exist.
 * Safe to call on every startup.
 */
export const runMigrations = async (): Promise<void> => {
  const db = getPool();
  if (!db) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id                  TEXT PRIMARY KEY,
      name                TEXT NOT NULL,
      emoji               TEXT,
      status              TEXT NOT NULL DEFAULT 'not-started',
      priority            TEXT NOT NULL DEFAULT 'medium',
      start_date          TEXT,
      due_date            TEXT,
      progress            INTEGER NOT NULL DEFAULT 0,
      codex_enabled       BOOLEAN NOT NULL DEFAULT false,
      related_project_ids JSONB NOT NULL DEFAULT '[]',
      notes_count         INTEGER NOT NULL DEFAULT 0,
      updated_at          TEXT NOT NULL,
      calendar_event_id   TEXT,
      tags                JSONB NOT NULL DEFAULT '[]',
      notes               TEXT NOT NULL DEFAULT '',
      drive_file_id       TEXT,
      drive_view_url      TEXT
    );

    CREATE TABLE IF NOT EXISTS progress_logs (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      summary     TEXT NOT NULL,
      minutes     INTEGER NOT NULL DEFAULT 0,
      source      TEXT NOT NULL DEFAULT 'manual',
      created_at  TEXT NOT NULL
    );
  `);
};
