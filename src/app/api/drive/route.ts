/**
 * POST /api/drive
 * Uploads or updates a task MD file to Google Drive.
 *
 * Body: { projectId: string; content: string; name: string; startDate?: string }
 * Returns: { driveFileId: string; viewUrl: string }
 *
 * Folder structure on Drive:
 *   TaskManager/tasks/YYYY-MM/<projectId> — <name>.md
 *
 * Drive IDs are cached in data/drive-index.json so we can update files on edits.
 *
 * Race-condition prevention:
 *   All folder-resolution work is serialised through a module-level Promise chain
 *   (folderMutex). This means concurrent POST requests wait for each other before
 *   touching Drive, so we never create duplicate TaskManager/ or YYYY-MM/ folders.
 */

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

const ROOT_FOLDER_NAME  = "TaskManager";
const TASKS_FOLDER_NAME = "tasks";

const bodySchema = z.object({
  projectId: z.string(),
  name:      z.string(),
  content:   z.string(),
  startDate: z.string().optional(),
});

// ── Drive index (projectId → fileId/viewUrl) ─────────────────────────────────
const getIndexPath = () =>
  process.env.DRIVE_INDEX_FILE ??
  path.join(process.cwd(), "data", "drive-index.json");

type FolderCache = { tasksId?: string; monthIds: Record<string, string> };
type FileEntry   = { fileId: string; monthFolderId: string; viewUrl: string };
type DriveIndex  = Record<string, FileEntry | { folderId?: string } | { monthFolderId?: string }>;

// Module-level folder cache — survives across requests in the same Node process.
const folderCache: FolderCache = { monthIds: {} };

// Serialisation mutex — all folder-touching work is chained onto this promise.
let folderMutex: Promise<void> = Promise.resolve();

const loadIndex = async (): Promise<DriveIndex> => {
  try { return JSON.parse(await readFile(getIndexPath(), "utf8")); }
  catch { return {}; }
};

const saveIndex = async (index: DriveIndex) => {
  await mkdir(path.dirname(getIndexPath()), { recursive: true });
  await writeFile(getIndexPath(), JSON.stringify(index, null, 2));
};

// ── Google OAuth token ───────────────────────────────────────────────────────
const getDriveAccessToken = async (): Promise<string | null> => {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const stateFilePath =
    process.env.TASK_MANAGER_STATE_FILE ??
    path.join(process.cwd(), "data", "task-manager.json");

  let refreshToken: string | undefined;
  try {
    const raw = JSON.parse(await readFile(stateFilePath, "utf8"));
    refreshToken = raw?.googleDrive?.refreshToken;
  } catch { return null; }

  if (!refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
};

// ── Drive REST helpers ───────────────────────────────────────────────────────
const driveGet = (token: string, url: string) =>
  fetch(url, { headers: { Authorization: `Bearer ${token}` } });

const drivePost = (token: string, url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * Find an existing folder by name + parent, or create it.
 * Using Drive v2 because it supports `title` in queries.
 */
const findOrCreateFolder = async (
  token:    string,
  name:     string,
  parentId: string | null,
): Promise<string> => {
  const parentClause = parentId
    ? ` and '${parentId}' in parents`
    : ` and 'root' in parents`;
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and title='${name}'${parentClause} and trashed=false`,
  );
  const searchRes = await driveGet(token, `https://www.googleapis.com/drive/v2/files?q=${q}&fields=items(id)`);
  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.items?.length > 0) return data.items[0].id as string;
  }

  const meta: Record<string, unknown> = {
    title:    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) meta.parents = [{ id: parentId }];

  const createRes = await drivePost(token, "https://www.googleapis.com/drive/v2/files", meta);
  const folder = await createRes.json();
  if (!folder.id) throw new Error(`Failed to create folder "${name}": ${JSON.stringify(folder)}`);
  return folder.id as string;
};

/**
 * Ensure TaskManager/tasks/YYYY-MM exists.
 * All calls are serialised through folderMutex to prevent duplicate creation.
 */
const ensureMonthFolder = (token: string, month: string): Promise<string> => {
  // Chain onto the mutex so concurrent requests queue up
  const work = folderMutex.then(async () => {
    // 1. Check in-memory cache first (fast path)
    if (folderCache.monthIds[month]) return folderCache.monthIds[month];

    // 2. Resolve tasks folder (also cached)
    if (!folderCache.tasksId) {
      const rootId = await findOrCreateFolder(token, ROOT_FOLDER_NAME, null);
      folderCache.tasksId = await findOrCreateFolder(token, TASKS_FOLDER_NAME, rootId);
    }

    // 3. Resolve month folder
    const monthId = await findOrCreateFolder(token, month, folderCache.tasksId);
    folderCache.monthIds[month] = monthId;
    return monthId;
  });

  // Update the mutex (next request waits for this one to finish)
  folderMutex = work.then(() => {}).catch(() => {});
  return work;
};

// ── File upload / update ─────────────────────────────────────────────────────
const uploadFile = async (
  token:          string,
  folderId:       string,
  title:          string,
  content:        string,
  existingFileId?: string,
): Promise<{ fileId: string; viewUrl: string }> => {
  const metadata: Record<string, unknown> = {
    title,
    mimeType: "text/plain",
    ...(existingFileId ? {} : { parents: [{ id: folderId }] }),
  };

  const boundary = "boundary_taskmanager_md";
  const bodyStr = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    content,
    `--${boundary}--`,
  ].join("\r\n");

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v2/files/${existingFileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingFileId ? "PUT" : "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary="${boundary}"`,
    },
    body: bodyStr,
  });

  const file = await res.json();
  if (!file.id) {
    console.error("[drive] Upload failed:", JSON.stringify(file));
    throw new Error(`Drive upload failed: ${file.error?.message ?? "unknown"}`);
  }
  return { fileId: file.id, viewUrl: `https://drive.google.com/file/d/${file.id}/view` };
};

// ── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const body   = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });

  const { projectId, name, content, startDate } = parsed.data;
  const month    = (startDate ?? new Date().toISOString()).slice(0, 7);
  const fileName = `${projectId} — ${name.replace(/[/\\:*?"<>|]/g, "-")}.md`;

  const token = await getDriveAccessToken();
  if (!token) return Response.json({ ok: true, local: true });

  try {
    const index         = await loadIndex();
    const existing      = (index[projectId] as FileEntry | undefined);
    const monthFolderId = await ensureMonthFolder(token, month);

    const { fileId, viewUrl } = await uploadFile(
      token,
      monthFolderId,
      fileName,
      content,
      existing?.fileId,
    );

    // Reload index before writing to pick up any changes from concurrent requests
    const freshIndex = await loadIndex();
    freshIndex[projectId] = { fileId, monthFolderId, viewUrl };
    await saveIndex(freshIndex);

    return Response.json({ ok: true, driveFileId: fileId, viewUrl });
  } catch (err) {
    console.error("[drive] Error:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
