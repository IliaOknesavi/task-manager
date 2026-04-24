/**
 * One-time migration script: reads data/task-manager.json and imports into PostgreSQL.
 * Run with: DATABASE_URL="..." node migrate.js
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const dataFile = path.join(__dirname, "data", "task-manager.json");
  if (!fs.existsSync(dataFile)) {
    console.error("data/task-manager.json not found");
    process.exit(1);
  }

  const raw = fs.readFileSync(dataFile, "utf-8");
  const state = JSON.parse(raw);

  const client = await pool.connect();
  try {
    // Run migrations
    await client.query(`
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

    // Save app state (without projects array)
    const { projects, progressLogs, ...appMeta } = state;
    await client.query(
      `INSERT INTO app_state (key, value) VALUES ('state', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(appMeta)]
    );

    // Insert projects
    let projectCount = 0;
    for (const p of projects || []) {
      // Try to load notes from .md file
      let notes = p.notes || "";
      const mdFile = path.join(__dirname, "tasks", `${p.id}.md`);
      if (fs.existsSync(mdFile)) {
        notes = fs.readFileSync(mdFile, "utf-8");
      }

      await client.query(
        `INSERT INTO projects (
          id, name, emoji, status, priority, start_date, due_date,
          progress, codex_enabled, related_project_ids, notes_count,
          updated_at, calendar_event_id, tags, notes, drive_file_id, drive_view_url
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO UPDATE SET
          name=$2, emoji=$3, status=$4, priority=$5, start_date=$6, due_date=$7,
          progress=$8, codex_enabled=$9, related_project_ids=$10, notes_count=$11,
          updated_at=$12, calendar_event_id=$13, tags=$14, notes=$15,
          drive_file_id=$16, drive_view_url=$17`,
        [
          p.id, p.name, p.emoji || null, p.status || "not-started",
          p.priority || "medium", p.startDate || null, p.dueDate || null,
          p.progress || 0, p.codexEnabled || false,
          JSON.stringify(p.relatedProjectIds || []),
          p.notesCount || 0, p.updatedAt || new Date().toISOString(),
          p.calendarEventId || null, JSON.stringify(p.tags || []),
          notes, p.driveFileId || null, p.driveViewUrl || null,
        ]
      );
      projectCount++;
    }

    // Insert progress logs
    let logCount = 0;
    for (const log of progressLogs || []) {
      await client.query(
        `INSERT INTO progress_logs (id, project_id, summary, minutes, source, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [log.id, log.projectId, log.summary, log.minutes || 0, log.source || "manual", log.createdAt]
      );
      logCount++;
    }

    console.log(`✅ Migration complete: ${projectCount} projects, ${logCount} progress logs`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
