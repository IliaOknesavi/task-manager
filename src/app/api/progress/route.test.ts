import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/progress/route";
import { createSeedState, saveAppState } from "@/lib/storage";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.TASK_MANAGER_STATE_FILE;
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("POST /api/progress", () => {
  it("persists a Codex progress update and returns the next workspace state", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "taskmanager-api-"));
    tempDirs.push(directory);
    const filePath = path.join(directory, "state.json");
    process.env.TASK_MANAGER_STATE_FILE = filePath;

    const seed = createSeedState();
    seed.currentProjectId = "proj-calendar";
    await saveAppState(filePath, seed);

    const response = await POST(
      new Request("http://localhost/api/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: "proj-calendar",
          summary: "Wired OAuth callback handler.",
          minutes: 40,
          progressDelta: 25,
          source: "codex",
        }),
      }),
    );

    const json = await response.json();
    const project = json.projects.find(
      (item: { id: string }) => item.id === "proj-calendar",
    );

    expect(response.status).toBe(200);
    expect(project.status).toBe("in-progress");
    expect(project.progress).toBe(25);
    expect(json.progressLogs.at(-1)?.summary).toBe("Wired OAuth callback handler.");
  });
});
