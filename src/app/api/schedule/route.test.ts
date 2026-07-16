import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/schedule/route";
import { PATCH, DELETE } from "@/app/api/schedule/[id]/route";

const tempDirs: string[] = [];

const useTempState = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "taskmanager-sched-api-"));
  tempDirs.push(directory);
  process.env.TASK_MANAGER_STATE_FILE = path.join(directory, "state.json");
};

afterEach(async () => {
  delete process.env.TASK_MANAGER_STATE_FILE;
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const createEntry = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/schedule", () => {
  it("creates an entry and returns it with a generated id", async () => {
    await useTempState();

    const response = await createEntry({
      date: "2026-07-16",
      startTime: "09:00",
      endTime: "10:00",
      title: "Morning focus",
      note: "no meetings",
    });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.id).toMatch(/^sched-/);
    expect(json.title).toBe("Morning focus");
    expect(json.status).toBe("planned");
  });

  it("rejects an entry whose end time is not after its start time", async () => {
    await useTempState();

    const response = await createEntry({
      date: "2026-07-16",
      startTime: "10:00",
      endTime: "10:00",
      title: "Zero-length",
    });

    expect(response.status).toBe(400);
  });

  it("rejects an entry linked to a project that does not exist", async () => {
    await useTempState();

    const response = await createEntry({
      date: "2026-07-16",
      startTime: "09:00",
      endTime: "10:00",
      title: "Ghost link",
      projectId: "proj-does-not-exist",
    });

    expect(response.status).toBe(400);
  });
});

describe("GET /api/schedule", () => {
  it("rejects malformed date filters instead of silently returning []", async () => {
    await useTempState();
    await createEntry({ date: "2026-07-16", startTime: "09:00", endTime: "10:00", title: "A" });

    const response = await GET(new Request("http://localhost/api/schedule?date=2026-7-16"));

    expect(response.status).toBe(400);
  });

  it("filters entries by ?date=", async () => {
    await useTempState();
    await createEntry({ date: "2026-07-16", startTime: "09:00", endTime: "10:00", title: "A" });
    await createEntry({ date: "2026-07-17", startTime: "09:00", endTime: "10:00", title: "B" });

    const response = await GET(new Request("http://localhost/api/schedule?date=2026-07-16"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].title).toBe("A");
  });
});

describe("PATCH /api/schedule/:id", () => {
  it("updates fields on an existing entry", async () => {
    await useTempState();
    const created = await (await createEntry({
      date: "2026-07-16", startTime: "09:00", endTime: "10:00", title: "A",
    })).json();

    const response = await PATCH(
      new Request(`http://localhost/api/schedule/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done", title: "A done" }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("done");
    expect(json.title).toBe("A done");
  });

  it("returns 404 for an unknown id", async () => {
    await useTempState();

    const response = await PATCH(
      new Request("http://localhost/api/schedule/sched-missing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      }),
      { params: Promise.resolve({ id: "sched-missing" }) },
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/schedule/:id", () => {
  it("deletes an existing entry", async () => {
    await useTempState();
    const created = await (await createEntry({
      date: "2026-07-16", startTime: "09:00", endTime: "10:00", title: "A",
    })).json();

    const response = await DELETE(
      new Request(`http://localhost/api/schedule/${created.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(response.status).toBe(200);
    const remaining = await (await GET(new Request("http://localhost/api/schedule"))).json();
    expect(remaining).toEqual([]);
  });
});
