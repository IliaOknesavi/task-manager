import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

const syncStateToGoogleCalendar = vi.fn();

vi.mock("@/lib/google-calendar", () => ({
  syncStateToGoogleCalendar,
}));

describe("POST /api/google-calendar/sync", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.TASK_MANAGER_STATE_FILE;
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("returns a 200 response and persists synced calendar metadata", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "taskmanager-calendar-"));
    tempDirs.push(directory);
    process.env.TASK_MANAGER_STATE_FILE = path.join(directory, "state.json");

    const { createSeedState, saveAppState, loadAppState } = await import("@/lib/storage");
    const seed = createSeedState();
    seed.googleCalendar = {
      connected: true,
      calendarId: "primary",
      refreshToken: "refresh-token-123",
    };
    await saveAppState(process.env.TASK_MANAGER_STATE_FILE, seed);

    syncStateToGoogleCalendar.mockResolvedValue({
      synced: 2,
      lastSyncedAt: "2026-04-22T11:30:00.000Z",
      state: {
        ...seed,
        googleCalendar: {
          ...seed.googleCalendar,
          lastSyncedAt: "2026-04-22T11:30:00.000Z",
        },
        projects: seed.projects.map((project, index) => ({
          ...project,
          calendarEventId: index === 0 ? "evt-1" : project.calendarEventId,
        })),
      },
    });

    const { POST } = await import("@/app/api/google-calendar/sync/route");
    const response = await POST();
    const json = await response.json();
    const persisted = await loadAppState(process.env.TASK_MANAGER_STATE_FILE);

    expect(response.status).toBe(200);
    expect(json).toEqual({
      synced: 2,
      lastSyncedAt: "2026-04-22T11:30:00.000Z",
    });
    expect(persisted.googleCalendar.lastSyncedAt).toBe("2026-04-22T11:30:00.000Z");
    expect(persisted.projects.some((project) => project.calendarEventId === "evt-1")).toBe(
      true,
    );
  });
});
