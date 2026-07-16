/**
 * POST /api/reset — wipe all projects and logs, reset to empty state
 */
import { rm } from "node:fs/promises";
import { resetAllData, getTasksDir } from "@/lib/storage";

export async function POST() {
  await resetAllData();

  // Remove all task MD files
  try {
    await rm(getTasksDir(), { recursive: true, force: true });
  } catch { /* ignore */ }

  return Response.json({ ok: true });
}
