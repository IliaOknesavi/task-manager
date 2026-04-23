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
