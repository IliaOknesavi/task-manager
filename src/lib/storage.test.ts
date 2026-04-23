import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { loadAppState, saveAppState } from "@/lib/storage";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("loadAppState", () => {
  it("returns a seeded workspace when the storage file does not exist yet", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "taskmanager-"));
    tempDirs.push(directory);

    const state = await loadAppState(path.join(directory, "state.json"));

    expect(state.projects.length).toBeGreaterThanOrEqual(4);
    expect(state.currentProjectId).toBe(state.projects[0]?.id);
    expect(state.googleCalendar.connected).toBe(false);
  });
});

describe("saveAppState", () => {
  it("persists and restores the workspace state as JSON", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "taskmanager-"));
    tempDirs.push(directory);
    const filePath = path.join(directory, "state.json");

    await saveAppState(filePath, {
      currentProjectId: "proj-1",
      googleCalendar: {
        connected: true,
        calendarId: "primary",
      },
      googleDrive: { connected: false },
      projects: [
        {
          id: "proj-1",
          name: "Codex integration",
          emoji: "🤖",
          status: "in-progress",
          priority: "high",
          startDate: "2026-04-22",
          dueDate: "2026-04-25",
          progress: 42,
          codexEnabled: true,
          relatedProjectIds: [],
          notesCount: 2,
          updatedAt: "2026-04-22T09:00:00.000Z",
        },
      ],
      progressLogs: [],
    });

    const restored = await loadAppState(filePath);

    expect(restored).toEqual({
      currentProjectId: "proj-1",
      googleCalendar: {
        connected: true,
        calendarId: "primary",
      },
      projects: [
        {
          id: "proj-1",
          name: "Codex integration",
          emoji: "🤖",
          status: "in-progress",
          priority: "high",
          startDate: "2026-04-22",
          dueDate: "2026-04-25",
          progress: 42,
          codexEnabled: true,
          relatedProjectIds: [],
          notesCount: 2,
          updatedAt: "2026-04-22T09:00:00.000Z",
        },
      ],
      progressLogs: [],
    });
  });
});
