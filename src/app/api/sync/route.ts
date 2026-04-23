/**
 * POST /api/sync
 * Full background sync: uploads all projects to Drive + syncs Calendar.
 * Safe to call repeatedly — Drive uses upsert via drive-index.json,
 * Calendar uses update-or-insert with existence check.
 *
 * Drive uploads are done sequentially (not in parallel) to avoid the
 * race-condition where concurrent requests create duplicate folders/files
 * before drive-index.json is updated.
 */

import { loadAppState, saveAppState, buildProjectMdContent } from "@/lib/storage";
import { syncStateToGoogleCalendar } from "@/lib/google-calendar";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000";

export async function POST() {
  const state = await loadAppState();
  const results: { drive?: unknown; calendar?: unknown; errors: string[] } = { errors: [] };

  // ── Drive sync ────────────────────────────────────────────────────────────
  if (state.googleDrive.connected && state.googleDrive.refreshToken) {
    let failed = 0;

    // Sequential uploads — each one waits for the previous to finish so that
    // folder IDs are cached before the next request runs.
    for (const project of state.projects) {
      try {
        await fetch(`${BASE_URL}/api/drive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            name:      project.name,
            content:   buildProjectMdContent(project),
            startDate: project.startDate,
          }),
        });
      } catch {
        failed++;
      }
    }

    results.drive = { total: state.projects.length, failed };
    if (failed > 0) results.errors.push(`Drive: ${failed} upload(s) failed`);
  }

  // ── Calendar sync ─────────────────────────────────────────────────────────
  if (state.googleCalendar.connected && state.googleCalendar.refreshToken) {
    try {
      const calResult = await syncStateToGoogleCalendar(state);
      await saveAppState(undefined, calResult.state);
      results.calendar = { synced: calResult.synced, lastSyncedAt: calResult.lastSyncedAt };
    } catch (err) {
      results.errors.push(`Calendar: ${(err as Error).message}`);
    }
  }

  return Response.json({ ok: true, ...results });
}
