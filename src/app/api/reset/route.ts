/**
 * POST /api/reset — wipe all projects and logs, reset to empty state
 */
import { rm } from "node:fs/promises";
import { saveAppState, getStorageFilePath, getTasksDir } from "@/lib/storage";
import type { AppState } from "@/lib/domain";

export async function POST() {
  const empty: AppState = {
    currentProjectId: undefined,
    googleCalendar: { connected: false },
    googleDrive: { connected: false },
    projects: [],
    progressLogs: [],
  };

  await saveAppState(getStorageFilePath(), empty);

  // Remove all task MD files
  try {
    await rm(getTasksDir(), { recursive: true, force: true });
  } catch { /* ignore */ }

  return Response.json({ ok: true });
}
