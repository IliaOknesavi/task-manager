import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import type { AppState, ProgressInput, ProgressLog, Project } from "@/lib/domain";
import type { GoogleDriveState } from "@/lib/domain";
import { appendProgressLog } from "@/lib/domain";
import { getPool, runMigrations } from "@/lib/db";

// ── Helpers ──────────────────────────────────────────────────────────────────

export const getTasksDir = () =>
  process.env.TASK_MANAGER_TASKS_DIR ??
  path.join(process.cwd(), "tasks");

export const getStorageFilePath = () =>
  process.env.TASK_MANAGER_STATE_FILE ??
  path.join(process.cwd(), "data", "task-manager.json");

const isPostgres = () => Boolean(process.env.DATABASE_URL);

// ── Zod schemas (used for file-based storage validation) ─────────────────────

const projectStatusSchema = z.enum(["not-started", "in-progress", "done"]);
const projectPrioritySchema = z.enum(["ultra-high", "high", "medium", "low", "no-priority"]);
const progressSourceSchema = z.enum(["codex", "manual", "calendar"]);

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().optional(),
  status: projectStatusSchema,
  priority: projectPrioritySchema,
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  progress: z.number().int().min(0).max(100),
  codexEnabled: z.boolean(),
  relatedProjectIds: z.array(z.string()),
  notesCount: z.number().int().min(0),
  updatedAt: z.string(),
  calendarEventId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const progressLogSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  summary: z.string(),
  minutes: z.number().int().min(0),
  source: progressSourceSchema,
  createdAt: z.string(),
});

const appStateSchema = z.object({
  currentProjectId: z.string().optional(),
  googleCalendar: z.object({
    connected: z.boolean(),
    calendarId: z.string().optional(),
    lastSyncedAt: z.string().optional(),
    refreshToken: z.string().optional(),
  }),
  googleDrive: z.object({
    connected: z.boolean(),
    refreshToken: z.string().optional(),
  }).optional(),
  projects: z.array(projectSchema),
  progressLogs: z.array(progressLogSchema),
});

// ── Seed data ─────────────────────────────────────────────────────────────────

const now = "2026-04-22T10:00:00.000Z";

const seedProjects: Project[] = [
  {
    id: "proj-taskmanager",
    name: "Task Manager core",
    emoji: "🧠",
    status: "in-progress",
    priority: "ultra-high",
    startDate: "2026-04-22",
    dueDate: "2026-04-30",
    progress: 52,
    codexEnabled: true,
    relatedProjectIds: ["proj-calendar", "proj-skill"],
    notesCount: 4,
    updatedAt: now,
  },
  {
    id: "proj-calendar",
    name: "Google Calendar sync",
    emoji: "📆",
    status: "not-started",
    priority: "high",
    startDate: "2026-04-24",
    dueDate: "2026-04-28",
    progress: 0,
    codexEnabled: true,
    relatedProjectIds: ["proj-taskmanager"],
    notesCount: 1,
    updatedAt: "2026-04-20T08:00:00.000Z",
  },
];

const seedLogs: ProgressLog[] = [
  {
    id: "log-seed-1",
    projectId: "proj-taskmanager",
    summary: "Mapped workspace model and task views.",
    minutes: 45,
    source: "codex",
    createdAt: "2026-04-20T09:00:00.000Z",
  },
];

export const createSeedState = (): AppState => ({
  currentProjectId: seedProjects[0]?.id,
  googleCalendar: { connected: false },
  googleDrive: { connected: false },
  projects: seedProjects,
  progressLogs: seedLogs,
});

// ── Markdown content builder ──────────────────────────────────────────────────

export const buildProjectMdContent = (project: Project): string => {
  const lines: string[] = [];

  if (project.tags && project.tags.length > 0) {
    lines.push("---");
    lines.push(`tags: [${project.tags.join(", ")}]`);
    lines.push("---");
    lines.push("");
  }

  lines.push(`# ${project.emoji ? `${project.emoji} ` : ""}${project.name}`);
  lines.push("");

  if (project.tags && project.tags.length > 0) {
    lines.push(project.tags.map(tag => `#${tag}`).join(" "));
    lines.push("");
  }

  lines.push(`**Status:** ${project.status}`);
  lines.push(`**Priority:** ${project.priority}`);
  lines.push(`**Progress:** ${project.progress}%`);
  lines.push(`**Start:** ${project.startDate ?? "—"}`);
  lines.push(`**Due:** ${project.dueDate ?? "—"}`);
  lines.push(`**Codex:** ${project.codexEnabled ? "enabled" : "manual"}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Goal");
  lines.push("");
  lines.push("<!-- Describe what success looks like for this project -->");
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push("<!-- Background, constraints, relevant links -->");
  lines.push("");
  lines.push("## Tasks");
  lines.push("");
  lines.push("- [ ] ");
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("<!-- Freeform notes, decisions, blockers -->");

  return lines.join("\n");
};

// ── PostgreSQL storage ────────────────────────────────────────────────────────

let _migrated = false;
const ensureMigrated = async () => {
  if (_migrated) return;
  await runMigrations();
  _migrated = true;
};

const rowToProject = (row: Record<string, unknown>): Project => ({
  id: row.id as string,
  name: row.name as string,
  emoji: (row.emoji as string) || undefined,
  status: row.status as Project["status"],
  priority: row.priority as Project["priority"],
  startDate: (row.start_date as string) || undefined,
  dueDate: (row.due_date as string) || undefined,
  progress: row.progress as number,
  codexEnabled: row.codex_enabled as boolean,
  relatedProjectIds: (row.related_project_ids as string[]) ?? [],
  notesCount: row.notes_count as number,
  updatedAt: row.updated_at as string,
  calendarEventId: (row.calendar_event_id as string) || undefined,
  tags: (row.tags as string[]) ?? [],
});

const pgLoadAppState = async (): Promise<AppState> => {
  const db = getPool()!;
  await ensureMigrated();

  const [projectsRes, logsRes, stateRes] = await Promise.all([
    db.query("SELECT * FROM projects ORDER BY updated_at DESC"),
    db.query("SELECT * FROM progress_logs ORDER BY created_at DESC"),
    db.query("SELECT value FROM app_state WHERE key = 'main'"),
  ]);

  const meta = stateRes.rows[0]?.value ?? {};

  return {
    currentProjectId: meta.currentProjectId,
    googleCalendar: meta.googleCalendar ?? { connected: false },
    googleDrive: meta.googleDrive ?? { connected: false },
    projects: projectsRes.rows.map(rowToProject),
    progressLogs: logsRes.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      projectId: r.project_id as string,
      summary: r.summary as string,
      minutes: r.minutes as number,
      source: r.source as ProgressLog["source"],
      createdAt: r.created_at as string,
    })),
  };
};

const pgSaveAppState = async (state: AppState): Promise<void> => {
  const db = getPool()!;
  await ensureMigrated();

  // Save meta (tokens, currentProjectId) — projects & logs are saved individually
  const meta = {
    currentProjectId: state.currentProjectId,
    googleCalendar: state.googleCalendar,
    googleDrive: state.googleDrive,
  };
  await db.query(
    `INSERT INTO app_state (key, value) VALUES ('main', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify(meta)],
  );
};

const pgUpsertProject = async (project: Project): Promise<void> => {
  const db = getPool()!;
  await db.query(
    `INSERT INTO projects
       (id, name, emoji, status, priority, start_date, due_date, progress,
        codex_enabled, related_project_ids, notes_count, updated_at,
        calendar_event_id, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO UPDATE SET
       name=$2, emoji=$3, status=$4, priority=$5, start_date=$6, due_date=$7,
       progress=$8, codex_enabled=$9, related_project_ids=$10, notes_count=$11,
       updated_at=$12, calendar_event_id=$13, tags=$14`,
    [
      project.id, project.name, project.emoji ?? null,
      project.status, project.priority,
      project.startDate ?? null, project.dueDate ?? null,
      project.progress, project.codexEnabled,
      JSON.stringify(project.relatedProjectIds),
      project.notesCount, project.updatedAt,
      project.calendarEventId ?? null,
      JSON.stringify(project.tags ?? []),
    ],
  );
};

const pgDeleteProject = async (id: string): Promise<boolean> => {
  const db = getPool()!;
  const res = await db.query("DELETE FROM projects WHERE id = $1", [id]);
  return (res.rowCount ?? 0) > 0;
};

const pgGetNotes = async (id: string): Promise<string> => {
  const db = getPool()!;
  const res = await db.query("SELECT notes FROM projects WHERE id = $1", [id]);
  return (res.rows[0]?.notes as string) ?? "";
};

const pgSetNotes = async (id: string, notes: string): Promise<void> => {
  const db = getPool()!;
  await db.query("UPDATE projects SET notes = $2 WHERE id = $1", [id, notes]);
};

const pgInsertLog = async (log: ProgressLog): Promise<void> => {
  const db = getPool()!;
  await db.query(
    `INSERT INTO progress_logs (id, project_id, summary, minutes, source, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [log.id, log.projectId, log.summary, log.minutes, log.source, log.createdAt],
  );
};

// ── Public API ────────────────────────────────────────────────────────────────

export const loadAppState = async (
  filePath = getStorageFilePath(),
): Promise<AppState> => {
  if (isPostgres()) return pgLoadAppState();

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = appStateSchema.parse(JSON.parse(raw));
    return { ...parsed, googleDrive: parsed.googleDrive ?? { connected: false } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return createSeedState();
    if (error instanceof z.ZodError) return createSeedState();
    throw error;
  }
};

export const saveAppState = async (
  filePath: string | undefined = getStorageFilePath(),
  state: AppState,
) => {
  if (isPostgres()) {
    await pgSaveAppState(state);
    // Also upsert all projects & logs (used by calendar sync which saves full state)
    await Promise.all(state.projects.map(pgUpsertProject));
    return;
  }
  await mkdir(path.dirname(filePath!), { recursive: true });
  await writeFile(filePath!, JSON.stringify(state, null, 2));
};

export const updateAppState = async <T>(
  updater: (state: AppState) => { state: AppState; result: T } | Promise<{ state: AppState; result: T }>,
  filePath = getStorageFilePath(),
) => {
  const current = await loadAppState(filePath);
  const { state, result } = await updater(current);
  await saveAppState(filePath, state);
  return result;
};

export const createProject = async (
  project: Project,
  filePath = getStorageFilePath(),
) => {
  if (isPostgres()) {
    await ensureMigrated();
    await pgUpsertProject(project);
    await pgSetNotes(project.id, buildProjectMdContent(project));
    return project;
  }
  const result = await updateAppState(
    (state) => ({ state: { ...state, projects: [...state.projects, project] }, result: project }),
    filePath,
  );
  createProjectMdFile(project).catch(() => {});
  return result;
};

export const updateProject = async (
  id: string,
  patch: Partial<Omit<Project, "id">>,
  filePath = getStorageFilePath(),
): Promise<Project | null> => {
  if (isPostgres()) {
    const state = await pgLoadAppState();
    const existing = state.projects.find((p) => p.id === id);
    if (!existing) return null;
    const updated: Project = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    await pgUpsertProject(updated);
    return updated;
  }
  return updateAppState(
    (state) => {
      const existing = state.projects.find((p) => p.id === id);
      if (!existing) return { state, result: null };
      const updated: Project = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
      return { state: { ...state, projects: state.projects.map((p) => p.id === id ? updated : p) }, result: updated };
    },
    filePath,
  );
};

export const setCurrentProject = async (
  projectId: string,
  filePath = getStorageFilePath(),
) => {
  if (isPostgres()) {
    const state = await pgLoadAppState();
    await pgSaveAppState({ ...state, currentProjectId: projectId });
    return projectId;
  }
  return updateAppState(
    (state) => ({ state: { ...state, currentProjectId: projectId }, result: projectId }),
    filePath,
  );
};

export const deleteProject = async (
  id: string,
  filePath = getStorageFilePath(),
): Promise<boolean> => {
  if (isPostgres()) return pgDeleteProject(id);
  return updateAppState(
    (state) => {
      const exists = state.projects.some((p) => p.id === id);
      if (!exists) return { state, result: false };
      return {
        state: {
          ...state,
          currentProjectId: state.currentProjectId === id ? undefined : state.currentProjectId,
          projects: state.projects.filter((p) => p.id !== id),
          progressLogs: state.progressLogs.filter((l) => l.projectId !== id),
        },
        result: true,
      };
    },
    filePath,
  );
};

export const recordProgress = async (
  input: ProgressInput,
  filePath = getStorageFilePath(),
) => {
  if (isPostgres()) {
    const state = await pgLoadAppState();
    const nextState = appendProgressLog(state, input);
    // Find the newly added log and persist it
    const newLog = nextState.progressLogs.find(
      (l) => !state.progressLogs.some((old) => old.id === l.id),
    );
    if (newLog) await pgInsertLog(newLog);
    // Update project progress if delta was provided
    const project = nextState.projects.find((p) => p.id === input.projectId);
    if (project) await pgUpsertProject(project);
    return nextState;
  }
  return updateAppState(
    (state) => { const nextState = appendProgressLog(state, input); return { state: nextState, result: nextState }; },
    filePath,
  );
};

export const saveGoogleCalendarTokens = async (
  input: { refreshToken: string; calendarId?: string; lastSyncedAt?: string },
  filePath = getStorageFilePath(),
) => {
  if (isPostgres()) {
    const state = await pgLoadAppState();
    await pgSaveAppState({
      ...state,
      googleCalendar: {
        connected: true,
        calendarId: input.calendarId ?? state.googleCalendar.calendarId ?? "primary",
        refreshToken: input.refreshToken,
        lastSyncedAt: input.lastSyncedAt ?? state.googleCalendar.lastSyncedAt,
      },
    });
    return true;
  }
  return updateAppState(
    (state) => ({
      state: {
        ...state,
        googleCalendar: {
          connected: true,
          calendarId: input.calendarId ?? state.googleCalendar.calendarId ?? "primary",
          refreshToken: input.refreshToken,
          lastSyncedAt: input.lastSyncedAt ?? state.googleCalendar.lastSyncedAt,
        },
      },
      result: true,
    }),
    filePath,
  );
};

export const saveGoogleDriveTokens = async (
  input: { refreshToken: string },
  filePath = getStorageFilePath(),
) => {
  if (isPostgres()) {
    const state = await pgLoadAppState();
    await pgSaveAppState({ ...state, googleDrive: { connected: true, refreshToken: input.refreshToken } });
    return true;
  }
  return updateAppState(
    (state) => ({ state: { ...state, googleDrive: { connected: true, refreshToken: input.refreshToken } }, result: true }),
    filePath,
  );
};

export const saveCalendarMetadata = async (
  updates: Partial<AppState["googleCalendar"]>,
  filePath = getStorageFilePath(),
) => {
  if (isPostgres()) {
    const state = await pgLoadAppState();
    await pgSaveAppState({ ...state, googleCalendar: { ...state.googleCalendar, ...updates } });
    return true;
  }
  return updateAppState(
    (state) => ({ state: { ...state, googleCalendar: { ...state.googleCalendar, ...updates } }, result: true }),
    filePath,
  );
};

// ── Notes (MD content) ────────────────────────────────────────────────────────

export const getProjectNotes = async (id: string, tasksDir = getTasksDir()): Promise<string> => {
  if (isPostgres()) return pgGetNotes(id);
  try {
    return await readFile(path.join(tasksDir, `${id}.md`), "utf8");
  } catch {
    return "";
  }
};

export const setProjectNotes = async (id: string, notes: string, tasksDir = getTasksDir()): Promise<void> => {
  if (isPostgres()) { await pgSetNotes(id, notes); return; }
  await mkdir(tasksDir, { recursive: true });
  await writeFile(path.join(tasksDir, `${id}.md`), notes, "utf8");
};

// ── File-based helpers (local dev only) ───────────────────────────────────────

export const createProjectMdFile = async (
  project: Project,
  tasksDir = getTasksDir(),
) => {
  await mkdir(tasksDir, { recursive: true });
  const filePath = path.join(tasksDir, `${project.id}.md`);
  try { await readFile(filePath, "utf8"); }
  catch { await writeFile(filePath, buildProjectMdContent(project), "utf8"); }
  return filePath;
};

// ── Migration: JSON → Postgres ────────────────────────────────────────────────

export const migrateFromFile = async (filePath = getStorageFilePath()): Promise<{ ok: boolean; message: string }> => {
  if (!isPostgres()) return { ok: false, message: "DATABASE_URL not set" };

  let fileState: AppState;
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = appStateSchema.parse(JSON.parse(raw));
    fileState = { ...parsed, googleDrive: parsed.googleDrive ?? { connected: false } };
  } catch {
    return { ok: false, message: "No file state found, skipping migration" };
  }

  await ensureMigrated();
  await pgSaveAppState(fileState);
  await Promise.all(fileState.projects.map(pgUpsertProject));

  // Migrate notes from .md files
  const tasksDir = getTasksDir();
  for (const project of fileState.projects) {
    try {
      const notes = await readFile(path.join(tasksDir, `${project.id}.md`), "utf8");
      await pgSetNotes(project.id, notes);
    } catch { /* no notes file, skip */ }
  }

  for (const log of fileState.progressLogs) {
    await pgInsertLog(log);
  }

  return { ok: true, message: `Migrated ${fileState.projects.length} projects, ${fileState.progressLogs.length} logs` };
};
