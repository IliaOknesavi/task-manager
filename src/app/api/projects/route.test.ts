import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/projects/route";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.TASK_MANAGER_STATE_FILE;
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("POST /api/projects", () => {
  it("creates a new project entry and returns it", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "taskmanager-api-"));
    tempDirs.push(directory);
    process.env.TASK_MANAGER_STATE_FILE = path.join(directory, "state.json");

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "proj-new",
          name: "Fresh project",
          emoji: "🆕",
          status: "not-started",
          priority: "medium",
          startDate: "2026-04-22",
          dueDate: "2026-04-26",
          progress: 0,
          codexEnabled: false,
          relatedProjectIds: [],
          notesCount: 0,
          updatedAt: "2026-04-22T11:00:00.000Z",
        }),
      }),
    );

    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.id).toBe("proj-new");
    expect(json.name).toBe("Fresh project");
  });
});
