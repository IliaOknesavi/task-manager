# Hourly To-Do Schedule — Design

**Date:** 2026-07-16
**Status:** Approved for autonomous implementation (handed-off build; decisions flagged in final report)

## Goal

Add a full hourly to-do schedule to TaskManager: per-day timed entries the user edits
in the web UI and agents edit through `/api/agent` and the MCP server.

## Approaches considered

- **A. First-class `ScheduleEntry` entities in AppState + dedicated PG table (chosen).**
  Fits every existing pattern: dual storage (JSON file / Postgres), `/api/state` polling,
  agent facade, MCP proxy. No new deps.
- **B. Schedule as markdown inside project notes.** Unstructured, racy for UI+MCP
  concurrent edits, no clean PATCH semantics. Rejected.
- **C. Google Calendar as the store.** Requires OAuth+network for every operation;
  the app treats Google as a sync target, not a source of truth. Rejected.

## Data model

```ts
type ScheduleEntryStatus = "planned" | "done" | "skipped";

type ScheduleEntry = {
  id: string;          // "sched-<uuid>"
  date: string;        // "YYYY-MM-DD" (naive local date, like project dates)
  startTime: string;   // "HH:MM" 24h
  endTime: string;     // "HH:MM", must be > startTime (same day)
  title: string;
  note?: string;
  projectId?: string;  // optional link to a project
  status: ScheduleEntryStatus;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
};
```

`AppState` gains `schedule: ScheduleEntry[]` (zod `.default([])` → old JSON files keep loading).

- Minute precision; UI snaps to 15 minutes, hour grid for orientation.
- Overlaps are allowed; the UI lays overlapping entries out side-by-side (lane assignment).
- No recurrence in v1 (YAGNI). No timezone storage — single-user, single-TZ tool.
- Deleting a project keeps its schedule entries but clears their `projectId`
  (PG: `ON DELETE SET NULL`; file mode: explicit map).

## Storage

- **File mode:** `schedule` array persisted inside `data/task-manager.json`.
- **Postgres:** new `schedule_entries` table created in `runMigrations`
  (id, date, start_time, end_time, title, note, project_id FK SET NULL, status,
  created_at, updated_at). `pgLoadAppState` loads all entries ordered by date, start_time.
  CRUD helpers: upsert, delete.
- New storage functions: `createScheduleEntry`, `updateScheduleEntry`,
  `deleteScheduleEntry`, `listSchedule(from?, to?)`.

## API

REST (used by the UI):

- `GET  /api/schedule?date=YYYY-MM-DD` or `?from=&to=` → entries (all if no filter)
- `POST /api/schedule` → create (zod-validated)
- `PATCH  /api/schedule/:id` → partial update
- `DELETE /api/schedule/:id`

Agent facade (`POST /api/agent`), consumed by MCP/skills/Custom GPT:

- `{ "op": "schedule_list", "date"? | "from"?/"to"? }`
- `{ "op": "schedule_create", "entry": { date, startTime, endTime, title, note?, projectId?, status? } }`
- `{ "op": "schedule_update", "id", "patch": {...} }`
- `{ "op": "schedule_delete", "id" }`

Bulk day planning = array of `schedule_create` ops in the existing `operations[]` batch.

Validation: date `YYYY-MM-DD`, times `HH:MM`, `endTime > startTime`, non-empty title,
`projectId` must exist when provided.

## MCP server

`mcp-server/index.js` gains 4 tools proxying the agent ops:
`list_schedule`, `create_schedule_entry`, `update_schedule_entry`, `delete_schedule_entry`.

## UI — "Schedule" view

New tab in `dashboard-shell.tsx` (icon `CalendarClock`):

- Day navigation: ‹ / date / › + **Today**; native date input.
- 00:00–24:00 hour grid; auto-scroll to 08:00 (or first entry).
- Red "now" line when viewing today.
- Click an empty slot → create drawer prefilled with that hour (title, times,
  note, project link, status).
- Click an entry → same drawer in edit mode + delete (two-click confirm, matches app).
- Quick done-toggle directly on the entry card.
- Drag to move, bottom-edge drag to resize, 15-min snap (pattern mirrors GanttRow).
- Overlapping entries share width via lane layout (pure function, unit-tested).
- Entries linked to a project show its emoji + name; colors follow priority palette,
  done entries dimmed/struck.
- Sidebar untouched. `/api/state` polling keeps agent edits appearing within 30 s.

## Out of scope (v1)

- Recurring entries; Google Calendar sync of entries; auth on `/api/agent`
  (pre-existing gap, noted separately).

## Testing

- Domain: validation + lane-layout + sorting (vitest).
- Storage: file-mode persistence round-trip, backward compat (old JSON without
  `schedule`), project-delete clears links.
- API: route tests for `/api/schedule` GET/POST/PATCH/DELETE and agent schedule ops
  (file-mode temp dirs, same style as existing route tests).
- UI: render test for the Schedule view (entries positioned, tab switch works).
- End-to-end: dev server + browser verification of create/edit/done/delete.
