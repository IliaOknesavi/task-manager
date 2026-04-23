/**
 * POST /api/drive/cleanup
 * Finds duplicate .md files in TaskManager/tasks/** on Drive and deletes
 * all but the most recently modified copy for each projectId.
 * Also trashes duplicate TaskManager root folders.
 */

import path from "node:path";
import { readFile } from "node:fs/promises";

const ROOT_FOLDER_NAME = "TaskManager";

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
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
};

const driveGet = (token: string, url: string) =>
  fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

const driveTrash = (token: string, fileId: string) =>
  fetch(`https://www.googleapis.com/drive/v2/files/${fileId}/trash`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

// List all files/folders matching a query (handles pagination)
const listAll = async (token: string, q: string, fields = "items(id,title,modifiedDate,mimeType)"): Promise<{id:string;title:string;modifiedDate:string;mimeType:string}[]> => {
  const results: {id:string;title:string;modifiedDate:string;mimeType:string}[] = [];
  let pageToken: string | undefined;
  do {
    const url = `https://www.googleapis.com/drive/v2/files?q=${encodeURIComponent(q)}&fields=nextPageToken,${fields}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await driveGet(token, url);
    if (data.items) results.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return results;
};

export async function POST() {
  const token = await getDriveAccessToken();
  if (!token) return Response.json({ error: "Not connected" }, { status: 401 });

  const deleted: string[] = [];
  const errors: string[] = [];

  // ── 1. Deduplicate TaskManager root folders ───────────────────────────────
  const rootFolders = await listAll(
    token,
    `mimeType='application/vnd.google-apps.folder' and title='${ROOT_FOLDER_NAME}' and 'root' in parents and trashed=false`,
  );

  if (rootFolders.length > 1) {
    // Keep the oldest (first created = most data), trash the rest
    const sorted = [...rootFolders].sort((a, b) => a.modifiedDate.localeCompare(b.modifiedDate));
    for (const folder of sorted.slice(1)) {
      await driveTrash(token, folder.id);
      deleted.push(`folder: ${folder.title} (${folder.id})`);
    }
  }

  // ── 2. Deduplicate .md files by projectId prefix ──────────────────────────
  // Find all .md files anywhere under Drive whose title starts with "proj-"
  const mdFiles = await listAll(
    token,
    `title contains '.md' and mimeType='text/plain' and trashed=false`,
  );

  // Group by projectId (the part before " — ")
  const byProject = new Map<string, typeof mdFiles>();
  for (const file of mdFiles) {
    const match = file.title.match(/^(proj-[^ ]+)/);
    if (!match) continue;
    const pid = match[1];
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid)!.push(file);
  }

  // For each projectId with duplicates, keep the newest, trash the rest
  for (const [pid, files] of byProject.entries()) {
    if (files.length <= 1) continue;
    const sorted = [...files].sort((a, b) => b.modifiedDate.localeCompare(a.modifiedDate));
    for (const dupe of sorted.slice(1)) {
      try {
        await driveTrash(token, dupe.id);
        deleted.push(`file: ${dupe.title} (${dupe.id})`);
      } catch (e) {
        errors.push(`${pid}: ${(e as Error).message}`);
      }
    }
  }

  return Response.json({ ok: true, deleted, errors });
}
