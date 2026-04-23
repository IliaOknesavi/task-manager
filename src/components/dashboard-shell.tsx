"use client";

import {
  startTransition,
  useDeferredValue,
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
} from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  CircleDot,
  Flame,
  FolderKanban,
  GitBranchPlus,
  LayoutGrid,
  ListTodo,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";

import {
  calculateDashboardStats,
  groupProjectsByPriority,
  groupProjectsByStatus,
  type AppState,
  type Project,
  type ProjectPriority,
  type ProjectStatus,
} from "@/lib/domain";

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardView = "status" | "priority" | "all" | "gantt";

type CreateDefaults = {
  status?: ProjectStatus;
  priority?: ProjectPriority;
};

type DrawerState =
  | { kind: "create"; defaults?: CreateDefaults }
  | { kind: "edit"; project: Project };

type DropPatch =
  | { status: ProjectStatus }
  | { priority: ProjectPriority };

type DashboardShellProps = { initialState: AppState };

// ─── Constants ────────────────────────────────────────────────────────────────

const viewTabs: Array<{ id: DashboardView; label: string; icon: typeof LayoutGrid }> = [
  { id: "status",   label: "By Status",    icon: CircleDot   },
  { id: "priority", label: "By Priority",  icon: Sparkles    },
  { id: "all",      label: "All Projects", icon: ListTodo    },
  { id: "gantt",    label: "Gantt",        icon: CalendarDays },
];

const priorityOptions: ProjectPriority[] = [
  "ultra-high", "high", "medium", "low", "no-priority",
];

const defaultProjectForm = {
  name:         "",
  emoji:        "✨",
  priority:     "medium" as ProjectPriority,
  status:       "not-started" as ProjectStatus,
  startDate:    "",
  dueDate:      "",
  progress:     0,
  codexEnabled: false,
  tags:         "" as string,
};


type ProjectFormState = typeof defaultProjectForm;

// Helper to generate tag colors based on tag string hash
const getTagColor = (tag: string): string => {
  const colors = [
    "#e3f2fd", "#f3e5f5", "#e8f5e9", "#fff3e0", "#fce4ec",
    "#e0f2f1", "#f1f8e9", "#ede7f6", "#efebe9", "#eceff1",
  ];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const titleCase = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

const formatCompactDate = (v?: string) => {
  if (!v) return "No date";
  try {
    // datetime-local gives "YYYY-MM-DDTHH:MM", date gives "YYYY-MM-DD"
    const d = parseISO(v);
    const hasTime = v.includes("T") && v.length > 10;
    return hasTime ? format(d, "MMM d, HH:mm") : format(d, "MMM d");
  } catch {
    return v;
  }
};

const statusTone   = (s: ProjectStatus)   => `status-pill ${s}`;
const priorityTone = (p: ProjectPriority) => `priority-pill ${p}`;

const safeJsonFetch = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error("Request failed");
  return res.json() as Promise<T>;
};

const buildMdContent = (p: {
  name: string; emoji?: string; status: string; priority: string;
  progress: number; startDate?: string; dueDate?: string; codexEnabled: boolean;
}) =>
  [
    `# ${p.emoji ? `${p.emoji} ` : ""}${p.name}`,
    ``,
    `**Status:** ${p.status}`,
    `**Priority:** ${p.priority}`,
    `**Progress:** ${p.progress}%`,
    `**Start:** ${p.startDate ?? "—"}`,
    `**Due:** ${p.dueDate ?? "—"}`,
    `**Codex:** ${p.codexEnabled ? "enabled" : "manual"}`,
    ``,
    `---`,
    ``,
    `## Goal`,
    ``,
    `<!-- Describe what success looks like for this project -->`,
    ``,
    `## Context`,
    ``,
    `<!-- Background, constraints, relevant links -->`,
    ``,
    `## Tasks`,
    ``,
    `- [ ] `,
    ``,
    `## Notes`,
    ``,
    `<!-- Freeform notes, decisions, blockers -->`,
  ].join("\n");

// ─── Create-project drawer ────────────────────────────────────────────────────

function CreateDrawer({
  defaults,
  onClose,
  onSave,
}: {
  defaults?: CreateDefaults;
  onClose: () => void;
  onSave: (data: ProjectFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<ProjectFormState>({
    ...defaultProjectForm,
    ...(defaults?.status   ? { status: defaults.status }     : {}),
    ...(defaults?.priority ? { priority: defaults.priority } : {}),
  });
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const set = <K extends keyof ProjectFormState>(k: K, v: ProjectFormState[K]) =>
    setForm((c) => ({ ...c, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <div
      className="drawer-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="drawer-panel drawer-panel--narrow" role="dialog" aria-modal="true">
        <div className="drawer-header">
          <h2>New project</h2>
          <button className="modal-close" type="button" onClick={onClose}><X size={20} /></button>
        </div>

        <form className="stack-form drawer-body" onSubmit={handleSubmit}>
          <div className="modal-row">
            <label style={{ flex: "0 0 72px" }}>
              Emoji
              <input value={form.emoji} onChange={(e) => set("emoji", e.target.value)}
                style={{ textAlign: "center", fontSize: "1.4rem" }} />
            </label>
            <label style={{ flex: 1 }}>
              Project name *
              <input value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="What are you building?" required autoFocus />
            </label>
          </div>

          <div className="inline-fields">
            <label>
              Priority
              <select value={form.priority} onChange={(e) => set("priority", e.target.value as ProjectPriority)}>
                {priorityOptions.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </select>
            </label>
            <label>
              Status
              <select value={form.status} onChange={(e) => set("status", e.target.value as ProjectStatus)}>
                <option value="not-started">Not started</option>
                <option value="in-progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </label>
          </div>

          <div className="inline-fields">
            <label>
              Start date &amp; time
              <input type="datetime-local" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </label>
            <label>
              Due date &amp; time
              <input type="datetime-local" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </label>
          </div>

          <label>
            Tags
            <input value={form.tags} onChange={(e) => set("tags", e.target.value)}
              placeholder="e.g., backend, api, v2 (comma-separated)" />
          </label>

          <label className="checkbox-label">
            <input type="checkbox" checked={form.codexEnabled}
              onChange={(e) => set("codexEnabled", e.target.checked)} />
            Codex tracking enabled
          </label>

          <div className="modal-footer">
            <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Lightweight Markdown → HTML renderer (no deps) ──────────────────────────

function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML entities first
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Fenced code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // YAML frontmatter — hide it in preview
    .replace(/^---[\s\S]*?---\n?/, "")
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,  "<h2>$1</h2>")
    .replace(/^# (.+)$/gm,   "<h1>$1</h1>")
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,         "<em>$1</em>")
    // Horizontal rule
    .replace(/^---$/gm, "<hr>")
    // Checkboxes
    .replace(/^- \[x\] (.+)$/gim, '<li class="md-check md-check--done">$1</li>')
    .replace(/^- \[ \] (.+)$/gim, '<li class="md-check">$1</li>')
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>)|$)/g, "<ul>$1</ul>\n")
    // Inline tags (#tag)
    .replace(/#(\w[\w-]*)/g, '<span class="md-tag">#$1</span>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Paragraphs — blank-line separated blocks not starting with a block element
    .replace(/\n{2,}/g, "\n\n");

  // Wrap plain text paragraphs
  const lines = html.split("\n\n");
  html = lines.map((block) => {
    if (/^<(h[1-6]|ul|ol|pre|hr|li)/.test(block.trim())) return block;
    const trimmed = block.trim();
    if (!trimmed) return "";
    return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  return html;
}

// ─── Edit / Notion-style project drawer ──────────────────────────────────────

function ProjectDrawer({
  project,
  onClose,
  onSave,
  onDelete,
  onLogProgress,
}: {
  project: Project;
  onClose: () => void;
  onSave: (data: ProjectFormState, id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onLogProgress: (projectId: string, summary: string, minutes: number, progressDelta: number) => Promise<void>;
}) {
  const [form, setForm] = useState<ProjectFormState>({
    name:         project.name,
    emoji:        project.emoji ?? "✨",
    priority:     project.priority,
    status:       project.status,
    startDate:    project.startDate ?? "",
    dueDate:      project.dueDate ?? "",
    progress:     project.progress,
    codexEnabled: project.codexEnabled,
    tags:         project.tags?.join(", ") ?? "",
  });

  const [mdContent, setMdContent]   = useState<string>("");
  const [mdLoaded, setMdLoaded]     = useState(false);
  const [mdSaving, setMdSaving]     = useState(false);
  const [mdMode,   setMdMode]       = useState<"edit" | "preview">("edit");
  const [metaSaving, setMetaSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [logMinutes,    setLogMinutes]    = useState("30");
  const [logPercent,    setLogPercent]    = useState("10");
  const [logNote,       setLogNote]       = useState("");
  const [logSaving,     setLogSaving]     = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load MD on open
  useEffect(() => {
    safeJsonFetch<{ content: string }>(`/api/projects/${project.id}/notes`)
      .then(({ content }) => { setMdContent(content); setMdLoaded(true); })
      .catch(() => { setMdContent(buildMdContent(project)); setMdLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const set = <K extends keyof ProjectFormState>(k: K, v: ProjectFormState[K]) =>
    setForm((c) => ({ ...c, [k]: v }));

  // Autosave MD after 800ms of inactivity
  const handleMdChange = (val: string) => {
    setMdContent(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setMdSaving(true);
      try {
        await safeJsonFetch(`/api/projects/${project.id}/notes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: val }),
        });
      } finally { setMdSaving(false); }
    }, 800);
  };

  const handleMetaSave = async (e: FormEvent) => {
    e.preventDefault();
    setMetaSaving(true);
    try {
      await onSave(form, project.id);
    } finally {
      setMetaSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await onDelete(project.id);
    onClose();
  };

  return (
    <div
      className="drawer-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="drawer-panel drawer-panel--wide" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title">
            <span className="drawer-emoji">{form.emoji}</span>
            <input
              className="drawer-title-input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Project name"
            />
          </div>
          <div className="drawer-header-actions">
            <button
              className={`danger-button ${confirmDelete ? "danger-button--confirm" : ""}`}
              type="button"
              onClick={handleDelete}
              title={confirmDelete ? "Click again to confirm delete" : "Delete project"}
            >
              <Trash2 size={16} />
              {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
            <button className="modal-close" type="button" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        <div className="drawer-content">
          {/* Left: metadata form */}
          <form className="drawer-meta stack-form" onSubmit={handleMetaSave}>
            {/* Property pills row */}
            <div className="prop-row">
              <span className="prop-label">Status</span>
              <select
                className="prop-select"
                value={form.status}
                onChange={(e) => set("status", e.target.value as ProjectStatus)}
              >
                <option value="not-started">Not started</option>
                <option value="in-progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div className="prop-row">
              <span className="prop-label">Priority</span>
              <select
                className="prop-select"
                value={form.priority}
                onChange={(e) => set("priority", e.target.value as ProjectPriority)}
              >
                {priorityOptions.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </select>
            </div>

            <div className="prop-row">
              <span className="prop-label">Start</span>
              <input className="prop-input" type="datetime-local" value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)} />
            </div>

            <div className="prop-row">
              <span className="prop-label">Due</span>
              <input className="prop-input" type="datetime-local" value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)} />
            </div>

            <div className="prop-row">
              <span className="prop-label">Progress</span>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                <input type="range" min={0} max={100} value={form.progress}
                  onChange={(e) => set("progress", Number(e.target.value))}
                  style={{ flex: 1 }} />
                <span style={{ minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {form.progress}%
                </span>
              </div>
            </div>

            <div className="prop-row">
              <span className="prop-label">Emoji</span>
              <input className="prop-input" value={form.emoji}
                onChange={(e) => set("emoji", e.target.value)}
                style={{ width: 60, textAlign: "center", fontSize: "1.2rem" }} />
            </div>

            <div className="prop-row">
              <span className="prop-label">Tags</span>
              <input className="prop-input" value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="e.g., backend, api (comma-separated)" />
            </div>

            <div className="prop-row">
              <span className="prop-label">Codex</span>
              <label className="checkbox-label" style={{ margin: 0 }}>
                <input type="checkbox" checked={form.codexEnabled}
                  onChange={(e) => set("codexEnabled", e.target.checked)} />
                {form.codexEnabled ? "Enabled" : "Manual"}
              </label>
            </div>

            <button className="primary-button" type="submit" disabled={metaSaving}
              style={{ marginTop: 8 }}>
              {metaSaving ? "Saving…" : "Save changes"}
            </button>

            {/* ── Log progress — inside the meta form, below Save ── */}
            <div className="log-progress-block">
              <span className="log-progress-heading">Log progress</span>
              <div className="log-progress-row">
                <div className="log-progress-field">
                  <span className="log-progress-label">Min</span>
                  <input
                    type="number" min="1" value={logMinutes}
                    onChange={(e) => setLogMinutes(e.target.value)}
                    className="log-progress-input"
                  />
                </div>
                <div className="log-progress-field">
                  <span className="log-progress-label">+%</span>
                  <input
                    type="number" min="0" max="100" value={logPercent}
                    onChange={(e) => setLogPercent(e.target.value)}
                    className="log-progress-input"
                  />
                </div>
                <button
                  className="secondary-button log-progress-btn"
                  type="button"
                  disabled={logSaving}
                  onClick={async () => {
                    setLogSaving(true);
                    try {
                      await onLogProgress(project.id, logNote || "Progress logged", Number(logMinutes), Number(logPercent));
                    } finally { setLogSaving(false); }
                  }}
                >
                  {logSaving ? "…" : "Log"}
                </button>
              </div>
              <textarea
                className="log-progress-note"
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                placeholder="Note (optional)"
                rows={2}
              />
            </div>
          </form>

          {/* Right: MD editor / preview */}
          <div className="drawer-notes">
            <div className="drawer-notes-header">
              <span className="eyebrow">Notes · MD file</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {mdSaving && <span className="save-indicator">Saving…</span>}
                {!mdSaving && mdLoaded && <span className="save-indicator save-indicator--ok">Saved</span>}
                {/* Mode toggle */}
                <div className="md-mode-toggle">
                  <button
                    type="button"
                    className={`md-mode-btn ${mdMode === "edit" ? "md-mode-btn--active" : ""}`}
                    onClick={() => setMdMode("edit")}
                  >Edit</button>
                  <button
                    type="button"
                    className={`md-mode-btn ${mdMode === "preview" ? "md-mode-btn--active" : ""}`}
                    onClick={() => setMdMode("preview")}
                  >Preview</button>
                </div>
              </div>
            </div>
            {mdLoaded ? (
              mdMode === "edit" ? (
                <textarea
                  className="md-editor"
                  value={mdContent}
                  onChange={(e) => handleMdChange(e.target.value)}
                  spellCheck={false}
                  placeholder="Write markdown here…"
                />
              ) : (
                <div
                  className="md-preview"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(mdContent) }}
                />
              )
            ) : (
              <div className="md-loading">Loading…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reset confirmation dialog ─────────────────────────────────────────────────

function ResetDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="drawer-overlay" style={{ zIndex: 300 }}>
      <div className="modal-panel" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2>Reset all data?</h2>
          <button className="modal-close" type="button" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="stack-form" style={{ padding: "20px 24px 24px" }}>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            This will permanently delete all projects, progress logs, and MD files.
            This cannot be undone.
          </p>
          <div className="modal-footer">
            <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button
              className="danger-button danger-button--confirm"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try { await onConfirm(); onClose(); }
                finally { setBusy(false); }
              }}
            >
              {busy ? "Resetting…" : "Yes, reset everything"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DashboardShell ───────────────────────────────────────────────────────────

export function DashboardShell({ initialState }: DashboardShellProps) {
  const [state, setState]           = useState(initialState);
  const [view, setView]             = useState<DashboardView>("status");
  const [search, setSearch]         = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [drawer, setDrawer]         = useState<DrawerState | null>(null);
  const [showReset, setShowReset]   = useState(false);

  const deferredSearch = useDeferredValue(search);

  const needle = deferredSearch.trim().toLowerCase();
  const allTags = Array.from(new Set(state.projects.flatMap((p) => p.tags ?? [])));

  const filteredProjects = state.projects.filter((p) => {
    // Filter by tag
    if (selectedTag && !(p.tags ?? []).includes(selectedTag)) {
      return false;
    }
    // Filter by search
    if (!needle) return true;
    return [p.name, p.emoji, p.status, p.priority]
      .filter(Boolean).join(" ").toLowerCase().includes(needle);
  });

  const filteredState  = { ...state, projects: filteredProjects };
  const stats          = calculateDashboardStats(state);
  const statusColumns  = groupProjectsByStatus(filteredState.projects);
  const priorityColumns = groupProjectsByPriority(filteredState.projects);
  const focusProject   = stats.focusProject;
  const recentLogs     = [...state.progressLogs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  // ── Drive sync — debounced per project to avoid duplicate uploads ─────────
  // pendingDriveRef tracks in-flight uploads; driveTimerRef holds debounce timers.
  const pendingDriveRef = useRef<Set<string>>(new Set());
  const driveTimerRef   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const syncToDrive = useCallback((project: Project, content: string) => {
    if (!state.googleDrive?.connected) return;
    const id = project.id;

    // Cancel any pending debounce for this project
    const existing = driveTimerRef.current.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      driveTimerRef.current.delete(id);
      // Skip if an upload is already in-flight for this project
      if (pendingDriveRef.current.has(id)) return;
      pendingDriveRef.current.add(id);
      safeJsonFetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, name: project.name, content, startDate: project.startDate }),
      })
        .catch(() => {})
        .finally(() => pendingDriveRef.current.delete(id));
    }, 2000); // 2 s debounce — coalesce rapid edits

    driveTimerRef.current.set(id, timer);
  }, [state.googleDrive?.connected]);

  // ── Calendar auto-sync — debounced to avoid duplicate events ─────────────
  const calendarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calendarSyncInFlight = useRef(false);

  const autoSyncCalendar = useCallback(() => {
    if (!state.googleCalendar.connected) return;

    if (calendarTimerRef.current) clearTimeout(calendarTimerRef.current);

    calendarTimerRef.current = setTimeout(() => {
      calendarTimerRef.current = null;
      if (calendarSyncInFlight.current) return;
      calendarSyncInFlight.current = true;
      safeJsonFetch<{ synced: number; lastSyncedAt: string }>(
        "/api/google-calendar/sync", { method: "POST" },
      ).then((result) => {
        setState((cur) => ({
          ...cur,
          googleCalendar: { ...cur.googleCalendar, lastSyncedAt: result.lastSyncedAt },
        }));
      })
        .catch(() => {})
        .finally(() => { calendarSyncInFlight.current = false; });
    }, 3000); // 3 s debounce
  }, [state.googleCalendar.connected]);

  // ── Full background sync every 5 minutes + on tab focus ──────────────────
  const backgroundSync = useCallback(() => {
    if (!state.googleCalendar.connected && !state.googleDrive?.connected) return;
    safeJsonFetch<{ ok: boolean; calendar?: { lastSyncedAt: string } }>(
      "/api/sync", { method: "POST" },
    ).then((result) => {
      if (result.calendar?.lastSyncedAt) {
        setState((cur) => ({
          ...cur,
          googleCalendar: { ...cur.googleCalendar, lastSyncedAt: result.calendar!.lastSyncedAt },
        }));
      }
    }).catch(() => {});
  }, [state.googleCalendar.connected, state.googleDrive?.connected]);

  useEffect(() => {
    const interval = setInterval(backgroundSync, 5 * 60 * 1000); // every 5 min
    const onVisible = () => { if (document.visibilityState === "visible") backgroundSync(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [backgroundSync]);

  // ── Save handler (create + edit) ─────────────────────────────────────────
  const handleSave = async (data: ProjectFormState, id?: string) => {
    const parseTags = (tagsStr: string): string[] =>
      tagsStr
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);

    if (id) {
      const patch = {
        name:         data.name.trim(),
        emoji:        data.emoji.trim() || undefined,
        status:       data.status,
        priority:     data.priority,
        startDate:    data.startDate || undefined,
        dueDate:      data.dueDate || undefined,
        progress:     data.progress,
        codexEnabled: data.codexEnabled,
        tags:         parseTags(data.tags),
      };
      const updated = await safeJsonFetch<Project>(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setState((cur) => ({
        ...cur,
        projects: cur.projects.map((p) => (p.id === id ? updated : p)),
      }));
      // Update drawer project reference so UI reflects new values
      if (drawer?.kind === "edit") setDrawer({ kind: "edit", project: updated });
      syncToDrive(updated, buildMdContent(updated));
      // Auto-sync calendar if dates changed
      if (patch.startDate !== undefined || patch.dueDate !== undefined) autoSyncCalendar();
      setStatusMessage(`Updated ${updated.name}`);
    } else {
      const startDate = data.startDate || new Date().toISOString().slice(0, 10);
      const payload = {
        id: `proj-${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,
        name:         data.name.trim(),
        emoji:        data.emoji.trim() || undefined,
        status:       data.status,
        priority:     data.priority,
        dueDate:      data.dueDate || undefined,
        startDate,
        progress:     0,
        codexEnabled: data.codexEnabled,
        tags:         parseTags(data.tags),
        relatedProjectIds: state.currentProjectId ? [state.currentProjectId] : [],
        notesCount:   0,
        updatedAt:    new Date().toISOString(),
      };
      const project = await safeJsonFetch<Project>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setState((cur) => ({ ...cur, projects: [...cur.projects, project] }));
      syncToDrive(project, buildMdContent(project));
      autoSyncCalendar();
      setStatusMessage(`Added ${project.name}`);
    }
  };

  // ── Delete handler ────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    await safeJsonFetch(`/api/projects/${id}`, { method: "DELETE" });
    setState((cur) => ({
      ...cur,
      currentProjectId: cur.currentProjectId === id ? undefined : cur.currentProjectId,
      projects:     cur.projects.filter((p) => p.id !== id),
      progressLogs: cur.progressLogs.filter((l) => l.projectId !== id),
    }));
    setStatusMessage("Project deleted");
  };

  // ── Reset handler ─────────────────────────────────────────────────────────
  const handleReset = async () => {
    await safeJsonFetch("/api/reset", { method: "POST" });
    setState({ currentProjectId: undefined, googleCalendar: { connected: false }, googleDrive: { connected: false }, projects: [], progressLogs: [] });
    setStatusMessage("All data cleared");
  };


  const handleFocusChange = async (projectId: string) => {
    setState((cur) => ({ ...cur, currentProjectId: projectId }));
    try {
      await safeJsonFetch<{ ok: true }>("/api/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      setStatusMessage("Focus project changed locally only");
    }
  };

  const handleCalendarSync = async () => {
    try {
      if (!state.googleCalendar.connected) { window.location.href = "/api/google-calendar/connect"; return; }
      const result = await safeJsonFetch<{ synced: number; lastSyncedAt: string }>(
        "/api/google-calendar/sync", { method: "POST" },
      );
      setState((cur) => ({
        ...cur,
        googleCalendar: { ...cur.googleCalendar, lastSyncedAt: result.lastSyncedAt },
      }));
      setStatusMessage(`Google Calendar synced: ${result.synced} items`);
    } catch {
      setStatusMessage("Google Calendar sync needs credentials");
    }
  };

  // ── Drag-and-drop handler ─────────────────────────────────────────────────
  const handleDrop = useCallback(async (projectId: string, patch: DropPatch) => {
    // Optimistic update
    setState((cur) => ({
      ...cur,
      projects: cur.projects.map((p) =>
        p.id === projectId ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
      ),
    }));
    try {
      await safeJsonFetch<Project>(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      // On failure reload full state
      setStatusMessage("Failed to move project — refresh to sync");
    }
  }, []);

  // ── Gantt date-change handler ─────────────────────────────────────────────
  const handleGanttDateChange = useCallback(async (id: string, startDate: string, dueDate: string) => {
    setState((cur) => ({
      ...cur,
      projects: cur.projects.map((p) =>
        p.id === id ? { ...p, startDate, dueDate, updatedAt: new Date().toISOString() } : p,
      ),
    }));
    try {
      await safeJsonFetch<Project>(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, dueDate }),
      });
      autoSyncCalendar();
    } catch {
      setStatusMessage("Failed to update dates — refresh to sync");
    }
  }, [autoSyncCalendar]);

  // ── Log progress handler (called from ProjectDrawer) ─────────────────────
  const handleLogProgress = useCallback(async (
    projectId: string, summary: string, minutes: number, progressDelta: number,
  ) => {
    try {
      const nextState = await safeJsonFetch<AppState>("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, summary, minutes, progressDelta, source: "manual" }),
      });
      setState(nextState);
      // Sync drawer to updated project
      const updated = nextState.projects.find((p) => p.id === projectId);
      if (updated) setDrawer({ kind: "edit", project: updated });
    } catch {
      setStatusMessage("Failed to log progress");
    }
  }, []);

  const openCreate = (defaults?: CreateDefaults) => setDrawer({ kind: "create", defaults });
  const openEdit   = (project: Project)           => setDrawer({ kind: "edit", project });
  const closeDrawer = ()                          => setDrawer(null);

  return (
    <>
      {/* Drawers */}
      {drawer?.kind === "create" && (
        <CreateDrawer
          defaults={drawer.defaults}
          onClose={closeDrawer}
          onSave={(data) => handleSave(data)}
        />
      )}
      {drawer?.kind === "edit" && (
        <ProjectDrawer
          project={drawer.project}
          onClose={closeDrawer}
          onSave={(data, id) => handleSave(data, id)}
          onDelete={handleDelete}
          onLogProgress={handleLogProgress}
        />
      )}

      {/* Reset dialog */}
      {showReset && (
        <ResetDialog onClose={() => setShowReset(false)} onConfirm={handleReset} />
      )}

      <main className="dashboard-page">
        <section className="dashboard-main">
          <header className="hero-row">
            <div>
              <div className="hero-mark">
                <FolderKanban size={34} />
                <h1>Projects</h1>
              </div>
              <p className="hero-copy">
                Manage execution, keep Codex attached to the right project, and turn
                progress into visible momentum.
              </p>
            </div>

            <div className="hero-actions">
              <label className="search-field">
                <span>Search</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find tasks, priorities, tags"
                />
              </label>
              <button className="primary-button new-project-btn" onClick={() => openCreate()} type="button">
                <Plus size={18} />
                New project
              </button>
              {!state.googleCalendar.connected && (
                <button className="primary-button" onClick={handleCalendarSync} type="button">
                  Connect Calendar
                </button>
              )}
              {!state.googleDrive?.connected && (
                <button className="primary-button" onClick={() => { window.location.href = "/api/drive/connect"; }} type="button">
                  Connect Drive
                </button>
              )}
              <button
                className="reset-button"
                onClick={() => setShowReset(true)}
                type="button"
                title="Reset all data"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </header>

          <nav className="view-tabs" aria-label="Workspace views">
            {viewTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={`view-tab ${view === tab.id ? "active" : ""}`}
                  onClick={() => startTransition(() => setView(tab.id))}
                  type="button"
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {allTags.length > 0 && (
            <div className="tag-filter-bar">
              <span className="tag-filter-label">Filter:</span>
              <button
                className={`tag-filter-btn ${selectedTag === null ? "tag-filter-btn--active" : ""}`}
                onClick={() => setSelectedTag(null)}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className={`tag-filter-btn ${selectedTag === tag ? "tag-filter-btn--active" : ""}`}
                  style={selectedTag === tag ? { backgroundColor: getTagColor(tag) } : undefined}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {view === "status"   && <BoardColumns kind="status"   columns={statusColumns}   onCardClick={openEdit} onNewClick={(d) => openCreate(d)} onDrop={handleDrop} />}
          {view === "priority" && <BoardColumns kind="priority" columns={priorityColumns} onCardClick={openEdit} onNewClick={(d) => openCreate(d)} onDrop={handleDrop} />}
          {view === "all"      && <ProjectsTable state={filteredState} onRowClick={openEdit} />}
          {view === "gantt"    && <GanttView projects={filteredState.projects} onBarClick={openEdit} onDateChange={handleGanttDateChange} />}
        </section>

        <aside className="dashboard-side">
          {/* Codex focus */}
          <section className="side-card focus-card">
            <div className="side-card-header">
              <span className="eyebrow">Codex focus</span>
              <Target size={16} />
            </div>
            <select
              className="project-select"
              value={state.currentProjectId}
              onChange={(e) => handleFocusChange(e.target.value)}
            >
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji ? `${p.emoji} ` : ""}{p.name}
                </option>
              ))}
            </select>

            {focusProject && (
              <div className="focus-project">
                <div>
                  <strong>{focusProject.name}</strong>
                  <p>{titleCase(focusProject.priority)} priority · {focusProject.progress}% done</p>
                </div>
                <span className={statusTone(focusProject.status)}>{titleCase(focusProject.status)}</span>
              </div>
            )}
          </section>

          {/* Momentum */}
          <section className="side-card stats-card">
            <div className="side-card-header">
              <span className="eyebrow">Momentum</span>
              <Flame size={16} />
            </div>
            <div className="stat-grid">
              <Metric label="Completion" value={`${stats.completionRate}%`} />
              <Metric label="Level"      value={`Lv ${stats.level}`} />
              <Metric label="XP"         value={String(stats.xp)} />
              <Metric label="Streak"     value={`${stats.currentStreakDays}d`} />
              <Metric label="Tracked"    value={String(stats.codexTrackedProjects)} />
              <Metric label="Minutes"    value={String(stats.totalLoggedMinutes)} />
            </div>
            <div className="achievement-list">
              {stats.achievements.map((a) => (
                <div className="achievement" key={a.id}>
                  <strong>{a.title}</strong>
                  <p>{a.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Recent logs */}
          <section className="side-card">
            <div className="side-card-header">
              <span className="eyebrow">Recent logs</span>
              <GitBranchPlus size={16} />
            </div>
            <div className="log-list">
              {recentLogs.map((log) => {
                const proj = state.projects.find((p) => p.id === log.projectId);
                return (
                  <article className="log-item" key={log.id}>
                    <header>
                      <strong>{proj?.name ?? "Unknown project"}</strong>
                      <span>{log.minutes}m</span>
                    </header>
                    <p>{log.summary}</p>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Quick capture */}
          <section className="side-card">
            <div className="side-card-header">
              <span className="eyebrow">Quick capture</span>
              <ArrowRight size={16} />
            </div>
            <button
              className="secondary-button"
              style={{ width: "100%", justifyContent: "center" }}
              type="button"
              onClick={() => openCreate()}
            >
              <Plus size={16} />
              New project
            </button>
            {statusMessage && <p className="status-message">{statusMessage}</p>}
          </section>
        </aside>
      </main>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectCard({ project, onClick }: { project: Project; onClick: (p: Project) => void }) {
  return (
    <article
      className="project-card project-card--clickable"
      data-priority={project.priority}
      onClick={() => onClick(project)}
    >
      <header>
        <strong>
          {project.emoji ? `${project.emoji} ` : ""}
          {project.name}
        </strong>
      </header>
      <div className="card-meta">
        <span className={statusTone(project.status)}>{titleCase(project.status)}</span>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
          {project.progress}%
        </span>
      </div>
      {project.tags && project.tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {project.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: "0.72rem",
                padding: "2px 7px",
                borderRadius: 6,
                backgroundColor: getTagColor(tag),
                color: "#333",
                fontWeight: 500,
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
      <footer>
        <span style={{ fontSize: "0.78rem" }}>{formatCompactDate(project.startDate)}</span>
        <span style={{ fontSize: "0.78rem" }}>{formatCompactDate(project.dueDate)}</span>
      </footer>
      <div className="card-progress-bar">
        <div className="card-progress-bar-fill" style={{ width: `${project.progress}%` }} />
      </div>
    </article>
  );
}

function BoardColumns({
  kind, columns, onCardClick, onNewClick, onDrop,
}: {
  kind: "status" | "priority";
  columns: Array<{ count: number; projects: Project[]; status?: ProjectStatus; priority?: ProjectPriority }>;
  onCardClick: (p: Project) => void;
  onNewClick: (defaults: CreateDefaults) => void;
  onDrop: (projectId: string, patch: DropPatch) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  const handleCardDragStart = (e: React.DragEvent, projectId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("projectId", projectId);
  };

  const handleColumnDrop = (e: React.DragEvent, col: typeof columns[0]) => {
    e.preventDefault();
    setDragOver(null);
    const projectId = e.dataTransfer.getData("projectId");
    if (!projectId) return;
    const patch: DropPatch = kind === "status"
      ? { status: col.status! }
      : { priority: col.priority! };
    onDrop(projectId, patch);
  };

  return (
    <section className="board-grid">
      {columns.map((col) => {
        const label    = kind === "status" ? titleCase(col.status ?? "") : titleCase(col.priority ?? "");
        const colKey   = kind === "status" ? col.status! : col.priority!;
        const defaults = kind === "status" ? { status: col.status } : { priority: col.priority };

        return (
          <div
            className={`board-column ${kind} ${dragOver === colKey ? "drag-over-col" : ""}`}
            data-col={colKey}
            key={label}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => { e.preventDefault(); setDragOver(colKey); }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
            }}
            onDrop={(e) => handleColumnDrop(e, col)}
          >
            <header className="column-header">
              <span className={`column-label-pill ${colKey}`}>{label}</span>
              <strong style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{col.count}</strong>
            </header>
            <div className={`column-stack ${dragOver === colKey ? "drag-over" : ""}`}>
              {col.projects.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => handleCardDragStart(e, p.id)}
                  className="draggable-card"
                >
                  <ProjectCard project={p} onClick={onCardClick} />
                </div>
              ))}
              <div className="ghost-card" onClick={() => onNewClick(defaults)} style={{ cursor: "pointer" }}>
                + New project
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ProjectsTable({ state, onRowClick }: { state: AppState; onRowClick: (p: Project) => void }) {
  return (
    <section className="table-shell">
      <table className="projects-table">
        <thead>
          <tr>
            <th>Project</th><th>Status</th><th>Start</th>
            <th>End</th><th>Priority</th><th>Codex</th><th>Related</th>
          </tr>
        </thead>
        <tbody>
          {state.projects.map((p) => (
            <tr key={p.id} onClick={() => onRowClick(p)} style={{ cursor: "pointer" }} className="table-row--clickable">
              <td>{p.emoji ? `${p.emoji} ` : ""}{p.name}</td>
              <td><span className={statusTone(p.status)}>{titleCase(p.status)}</span></td>
              <td>{p.startDate ?? "—"}</td>
              <td>{p.dueDate ?? "—"}</td>
              <td><span className={priorityTone(p.priority)}>{titleCase(p.priority)}</span></td>
              <td>{p.codexEnabled ? "Enabled" : "Manual"}</td>
              <td>
                {p.relatedProjectIds
                  .map((rid) => state.projects.find((x) => x.id === rid)?.name ?? rid)
                  .join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── Gantt helpers ────────────────────────────────────────────────────────────

/** Strip time part — works for both "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM" */
function toDateOnly(s: string): string {
  return s.slice(0, 10);
}

function buildTimeline(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const cur = new Date(toDateOnly(startStr) + "T00:00:00");
  const lim = new Date(toDateOnly(endStr)   + "T00:00:00");
  while (cur <= lim) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(toDateOnly(dateStr) + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const GANTT_BAR_COLORS: Record<ProjectPriority, { bg: string; border: string; text: string }> = {
  "ultra-high": { bg: "linear-gradient(135deg,#ffe4e1,#ffc8c0)", border: "#f09080", text: "#8b2a1a" },
  "high":       { bg: "linear-gradient(135deg,#fff8db,#ffe99a)", border: "#e4c84a", text: "#7a5800" },
  "medium":     { bg: "linear-gradient(135deg,#dff0ff,#b8d9ff)", border: "#6eacf0", text: "#1a4f8a" },
  "low":        { bg: "linear-gradient(135deg,#e2f7e8,#b8eccc)", border: "#5dc98a", text: "#1e6640" },
  "no-priority":{ bg: "linear-gradient(135deg,#ede9f6,#d4ccec)", border: "#9b87d0", text: "#4a3b78" },
};

// ─── GanttView with drag-move + resize ───────────────────────────────────────

function GanttView({
  projects,
  onBarClick,
  onDateChange,
}: {
  projects: Project[];
  onBarClick: (p: Project) => void;
  onDateChange: (id: string, startDate: string, dueDate: string) => void;
}) {
  const dated = projects.filter((p) => p.startDate || p.dueDate);
  if (!dated.length) {
    return (
      <section className="gantt-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, color: "var(--muted)", fontSize: 15 }}>
        No scheduled projects yet — add a Start or Due date to a project.
      </section>
    );
  }

  // Pad timeline ±3 days for breathing room
  const allStarts = dated.map((p) => toDateOnly(p.startDate ?? p.dueDate!));
  const allEnds   = dated.map((p) => toDateOnly(p.dueDate   ?? p.startDate!));
  const rawMin    = [...allStarts, ...allEnds].sort()[0]!;
  const rawMax    = [...allStarts, ...allEnds].sort().at(-1)!;
  const timelineStart = addDays(rawMin, -3);
  const timelineEnd   = addDays(rawMax, +3);
  const timeline = buildTimeline(timelineStart, timelineEnd);

  const COL_W    = 48; // px per day column
  const HEADER_H = 38; // px — header height
  const ROW_H    = 52; // px — must match GanttRow exactly

  const totalW = timeline.length * COL_W;
  const today  = new Date().toISOString().slice(0, 10);

  return (
    <section className="gantt-shell" style={{ display: "flex", flexDirection: "row", overflow: "hidden" }}>
      {/* Fixed sidebar — pixel-perfect aligned to grid */}
      <div className="gantt-sidebar" style={{ flexShrink: 0, width: 220 }}>
        {/* Blank cell matching header height exactly */}
        <div style={{ height: HEADER_H, boxSizing: "border-box", borderBottom: "1px solid var(--line)" }} />
        {dated.map((p) => (
          <div
            className="gantt-name"
            key={p.id}
            onClick={() => onBarClick(p)}
            style={{ height: ROW_H, boxSizing: "border-box", cursor: "pointer" }}
          >
            <span style={{ fontSize: 15, flexShrink: 0 }}>{p.emoji}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          </div>
        ))}
      </div>

      {/* Single scrollable container — header + rows always share the same scroll position */}
      <div style={{ flex: 1, overflowX: "auto", position: "relative" }}>
        <div style={{ width: totalW, minWidth: "100%" }}>

          {/* Header */}
          <div style={{
            display: "flex",
            height: HEADER_H, boxSizing: "border-box",
            borderBottom: "1px solid var(--line)",
            position: "sticky", top: 0, zIndex: 10,
            background: "var(--panel-strong)",
          }}>
            {timeline.map((day) => {
              const d = new Date(day + "T00:00:00");
              const isFirst = d.getDate() === 1;
              const isToday = day === today;
              return (
                <div key={day} style={{
                  width: COL_W, flexShrink: 0, boxSizing: "border-box",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  fontSize: 11, color: isToday ? "var(--accent)" : "var(--muted)",
                  fontWeight: isToday ? 700 : 400,
                  borderLeft: isFirst ? "2px solid var(--line-strong)" : "1px solid var(--line)",
                  background: isToday ? "var(--accent-soft)" : undefined,
                }}>
                  {isFirst && (
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {format(d, "MMM")}
                    </span>
                  )}
                  <span>{d.getDate()}</span>
                </div>
              );
            })}
          </div>

          {/* Rows — each is exactly ROW_H px */}
          {dated.map((p) => (
            <GanttRow
              key={p.id}
              project={p}
              timeline={timeline}
              colW={COL_W}
              rowH={ROW_H}
              today={today}
              onBarClick={onBarClick}
              onDateChange={onDateChange}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function GanttRow({
  project,
  timeline,
  colW,
  rowH,
  today,
  onBarClick,
  onDateChange,
}: {
  project: Project;
  timeline: string[];
  colW: number;
  rowH: number;
  today: string;
  onBarClick: (p: Project) => void;
  onDateChange: (id: string, startDate: string, dueDate: string) => void;
}) {
  const startStr = toDateOnly(project.startDate ?? project.dueDate!);
  const endStr   = toDateOnly(project.dueDate   ?? project.startDate!);

  const colStart = timeline.indexOf(startStr);
  const colEnd   = timeline.indexOf(endStr);

  // Drag state: "move" | "resize-left" | "resize-right" | null
  const dragRef = useRef<{
    mode: "move" | "resize-left" | "resize-right";
    startX: number;
    origStart: string;
    origEnd: string;
  } | null>(null);

  const [localStart, setLocalStart] = useState(startStr);
  const [localEnd,   setLocalEnd]   = useState(endStr);
  const [dragging,   setDragging]   = useState(false);

  // Sync when project changes externally
  useEffect(() => {
    setLocalStart(toDateOnly(project.startDate ?? project.dueDate!));
    setLocalEnd(toDateOnly(project.dueDate ?? project.startDate!));
  }, [project.startDate, project.dueDate]);

  const ls = timeline.indexOf(localStart);
  const le = timeline.indexOf(localEnd);
  const left  = (ls < 0 ? colStart : ls) * colW;
  const width = ((le < 0 ? colEnd : le) - (ls < 0 ? colStart : ls) + 1) * colW;

  const colors = GANTT_BAR_COLORS[project.priority] ?? GANTT_BAR_COLORS["medium"];

  const startDrag = (mode: "move" | "resize-left" | "resize-right", e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, startX: e.clientX, origStart: localStart, origEnd: localEnd };
    setDragging(true);

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = me.clientX - dragRef.current.startX;
      const deltaDays = Math.round(dx / colW);
      const { mode: m, origStart, origEnd } = dragRef.current;
      if (m === "move") {
        setLocalStart(addDays(origStart, deltaDays));
        setLocalEnd(addDays(origEnd, deltaDays));
      } else if (m === "resize-right") {
        const newEnd = addDays(origEnd, deltaDays);
        if (newEnd >= origStart) setLocalEnd(newEnd);
      } else {
        const newStart = addDays(origStart, deltaDays);
        if (newStart <= origEnd) setLocalStart(newStart);
      }
    };

    const onUp = () => {
      if (!dragRef.current) return;
      setDragging(false);
      // Commit to parent
      const finalStart = dragRef.current.mode === "resize-right" ? dragRef.current.origStart : localStart;
      // use latest state via ref trick — capture in closure
      onDateChange(project.id, localStartRef.current, localEndRef.current);
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Keep refs synced for the onUp closure
  const localStartRef = useRef(localStart);
  const localEndRef   = useRef(localEnd);
  useEffect(() => { localStartRef.current = localStart; }, [localStart]);
  useEffect(() => { localEndRef.current   = localEnd;   }, [localEnd]);

  return (
    <div style={{ position: "relative", height: rowH, boxSizing: "border-box", borderBottom: "1px solid var(--line)", display: "flex" }}>
      {/* Column stripes — same width as header cells */}
      {timeline.map((day) => (
        <div key={day} style={{
          width: colW, flexShrink: 0,
          background: day === today ? "var(--accent-soft)" : undefined,
          borderLeft: new Date(day + "T00:00:00").getDate() === 1 ? "2px solid var(--line-strong)" : "1px solid var(--line)",
        }} />
      ))}

      {/* Bar */}
      <div
        onMouseDown={(e) => {
          // only main body triggers move (not handles)
          startDrag("move", e);
        }}
        onClick={(e) => {
          if (!dragging) onBarClick(project);
          e.stopPropagation();
        }}
        style={{
          position: "absolute",
          top: 6, height: rowH - 12,
          left, width: Math.max(width, colW),
          background: colors.bg,
          border: `1.5px solid ${colors.border}`,
          borderRadius: 12,
          display: "flex", alignItems: "center",
          paddingLeft: 10, paddingRight: 10,
          gap: 4,
          fontSize: 12, fontWeight: 600, color: colors.text,
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
          boxShadow: dragging ? "0 6px 24px rgba(0,0,0,0.18)" : "0 2px 8px rgba(0,0,0,0.08)",
          transition: dragging ? "none" : "box-shadow 0.15s",
          overflow: "hidden",
          zIndex: dragging ? 20 : 5,
        }}
      >
        {/* Left resize handle */}
        <div
          onMouseDown={(e) => { e.stopPropagation(); startDrag("resize-left", e); }}
          style={{
            position: "absolute", left: 0, top: 0, width: 10, height: "100%",
            cursor: "ew-resize", zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ width: 2, height: 16, background: colors.border, borderRadius: 2, opacity: 0.6 }} />
        </div>

        <span style={{ fontSize: 14 }}>{project.emoji}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {project.name}
        </span>

        {/* Right resize handle */}
        <div
          onMouseDown={(e) => { e.stopPropagation(); startDrag("resize-right", e); }}
          style={{
            position: "absolute", right: 0, top: 0, width: 10, height: "100%",
            cursor: "ew-resize", zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ width: 2, height: 16, background: colors.border, borderRadius: 2, opacity: 0.6 }} />
        </div>
      </div>
    </div>
  );
}
