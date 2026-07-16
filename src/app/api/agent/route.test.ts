import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/agent/route";

const tempDirs: string[] = [];

const useTempState = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "taskmanager-agent-"));
  tempDirs.push(directory);
  process.env.TASK_MANAGER_STATE_FILE = path.join(directory, "state.json");
  process.env.TASK_MANAGER_TASKS_DIR = path.join(directory, "tasks");
};

afterEach(async () => {
  delete process.env.TASK_MANAGER_STATE_FILE;
  delete process.env.TASK_MANAGER_TASKS_DIR;
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const callAgent = (body: unknown) =>
  POST(
    new Request("http://localhost/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/agent — schedule ops", () => {
  it("schedule_create creates an entry and schedule_list returns it", async () => {
    await useTempState();

    const created = await (await callAgent({
      op: "schedule_create",
      entry: {
        date: "2026-07-16",
        startTime: "09:00",
        endTime: "10:30",
        title: "Write NIR chapter",
        note: "library",
      },
    })).json();

    expect(created.id).toMatch(/^sched-/);
    expect(created.status).toBe("planned");

    const listed = await (await callAgent({
      op: "schedule_list",
      date: "2026-07-16",
    })).json();

    expect(listed).toHaveLength(1);
    expect(listed[0].title).toBe("Write NIR chapter");
  });

  it("schedule_create validates time ordering", async () => {
    await useTempState();

    const response = await callAgent({
      op: "schedule_create",
      entry: { date: "2026-07-16", startTime: "11:00", endTime: "10:00", title: "Bad" },
    });

    expect(response.status).toBe(400);
  });

  it("schedule_create rejects impossible calendar dates", async () => {
    await useTempState();

    const response = await callAgent({
      op: "schedule_create",
      entry: { date: "2026-02-30", startTime: "09:00", endTime: "10:00", title: "Ghost day" },
    });

    expect(response.status).toBe(400);
  });

  it("schedule_create rejects an empty-string projectId", async () => {
    await useTempState();

    const response = await callAgent({
      op: "schedule_create",
      entry: { date: "2026-07-16", startTime: "09:00", endTime: "10:00", title: "A", projectId: "" },
    });

    expect(response.status).toBe(400);
  });

  it("schedule_update patches an entry", async () => {
    await useTempState();
    const created = await (await callAgent({
      op: "schedule_create",
      entry: { date: "2026-07-16", startTime: "09:00", endTime: "10:00", title: "A" },
    })).json();

    const updated = await (await callAgent({
      op: "schedule_update",
      id: created.id,
      patch: { status: "done" },
    })).json();

    expect(updated.status).toBe("done");
  });

  it("schedule_delete removes an entry", async () => {
    await useTempState();
    const created = await (await callAgent({
      op: "schedule_create",
      entry: { date: "2026-07-16", startTime: "09:00", endTime: "10:00", title: "A" },
    })).json();

    const deleted = await (await callAgent({
      op: "schedule_delete",
      id: created.id,
    })).json();
    expect(deleted).toEqual({ ok: true });

    const listed = await (await callAgent({ op: "schedule_list" })).json();
    expect(listed).toEqual([]);
  });

  it("supports batch day planning through operations[]", async () => {
    await useTempState();

    const response = await callAgent({
      operations: [
        { op: "schedule_create", entry: { date: "2026-07-17", startTime: "09:00", endTime: "10:00", title: "Standup prep" } },
        { op: "schedule_create", entry: { date: "2026-07-17", startTime: "10:00", endTime: "12:00", title: "CoScientist" } },
        { op: "schedule_list", date: "2026-07-17" },
      ],
    });
    const { results } = await response.json();

    expect(results).toHaveLength(3);
    expect(results[2]).toHaveLength(2);
    expect(results[2][0].title).toBe("Standup prep");
  });

  it("existing project ops still work", async () => {
    await useTempState();

    const listed = await (await callAgent({ op: "list" })).json();
    expect(Array.isArray(listed)).toBe(true);
  });
});
