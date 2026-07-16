# TaskManager Agent API

Base URL: http://localhost:3000 (or wherever the app runs)

## Single-operation endpoint

POST /api/agent
Content-Type: application/json

Send a single operation object. Examples:

### List all projects
```json
{ "op": "list" }
```

### Get one project
```json
{ "op": "get", "id": "proj-taskmanager" }
```

### Create project
```json
{
  "op": "create",
  "project": {
    "name": "My new project",
    "emoji": "🚀",
    "status": "not-started",
    "priority": "high",
    "tags": ["backend", "v2"],
    "codexEnabled": true
  }
}
```

### Update project
```json
{
  "op": "update",
  "id": "proj-taskmanager",
  "patch": { "status": "done", "progress": 100, "tags": ["shipped"] }
}
```

### Delete project
```json
{ "op": "delete", "id": "proj-taskmanager" }
```

### Read notes (MD file)
```json
{ "op": "read_notes", "id": "proj-taskmanager" }
```

### Write notes (full MD file content)
```json
{
  "op": "write_notes",
  "id": "proj-taskmanager",
  "content": "# 🧠 Task Manager core\n\n## Goal\nShip it.\n"
}
```

### Log progress
```json
{
  "op": "log_progress",
  "projectId": "proj-taskmanager",
  "summary": "Implemented drag-and-drop",
  "minutes": 45,
  "progressDelta": 10
}
```

### Schedule — hourly to-do plan

Entries live on a per-day hourly timeline (date `YYYY-MM-DD`, times `HH:MM` 24h,
`endTime` must be after `startTime`, minute precision, 15-min snapping in the UI).
`status`: `planned` (default) | `done` | `skipped`. `projectId` optionally links an
entry to a project (validated; cleared automatically if the project is deleted).

#### List schedule
```json
{ "op": "schedule_list" }
{ "op": "schedule_list", "date": "2026-07-16" }
{ "op": "schedule_list", "from": "2026-07-14", "to": "2026-07-20" }
```

#### Create entry
```json
{
  "op": "schedule_create",
  "entry": {
    "date": "2026-07-16",
    "startTime": "09:00",
    "endTime": "10:30",
    "title": "Deep work: NIR chapter",
    "note": "library, no phone",
    "projectId": "proj-taskmanager",
    "status": "planned"
  }
}
```
Returns the created entry with a generated `sched-...` id.
To plan a whole day, send several `schedule_create` ops in one `operations[]` batch.

#### Update entry
```json
{
  "op": "schedule_update",
  "id": "sched-...",
  "patch": { "status": "done", "endTime": "11:00" }
}
```
In `patch`, `note: null` / `projectId: null` clear the field; absent fields stay untouched.

#### Delete entry
```json
{ "op": "schedule_delete", "id": "sched-..." }
```

## Tag conventions (Obsidian-compatible)
- Tags are stored as plain strings without `#`: ["backend", "v2"]
- In MD files they appear as frontmatter AND inline: #backend #v2
- Filter projects by tag: GET /api/projects?tag=backend (implement this too on the GET /api/projects handler)

## Individual REST endpoints (also available)
- GET    /api/projects              → list all
- POST   /api/projects              → create
- GET    /api/projects/:id/notes    → read MD
- PUT    /api/projects/:id/notes    → write MD
- PATCH  /api/projects/:id          → update fields
- DELETE /api/projects/:id          → delete
- GET    /api/tags                  → all tags
- POST   /api/reset                 → wipe everything
- GET    /api/schedule              → all schedule entries (?date=YYYY-MM-DD or ?from=&to=)
- POST   /api/schedule              → create schedule entry
- PATCH  /api/schedule/:id          → update schedule entry
- DELETE /api/schedule/:id          → delete schedule entry
