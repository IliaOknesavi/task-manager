import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadAppState,
  saveAppState,
  createSeedState,
  createScheduleEntry,
  updateScheduleEntry,
  deleteScheduleEntry,
  listSchedule,
  deleteProject,
  resetAllData,
} from "@/lib/storage";
import type { ScheduleEntry } from "@/lib/domain";

const tempDirs: string[] = [];

const makeStateFile = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "taskmanager-sched-"));
  tempDirs.push(directory);
  return path.join(directory, "state.json");
};

const sampleEntry = (overrides: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  id: "sched-1",
  date: "2026-07-16",
  startTime: "09:00",
  endTime: "10:30",
  title: "Deep work",
  note: "darwin-rag",
  status: "planned",
  createdAt: "2026-07-16T08:00:00.000Z",
  updatedAt: "2026-07-16T08:00:00.000Z",
  ...overrides,
});

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("schedule persistence (file mode)", () => {
  it("round-trips schedule entries through save/load", async () => {
    const filePath = await makeStateFile();
    const state = { ...createSeedState(), schedule: [sampleEntry()] };

    await saveAppState(filePath, state);
    const restored = await loadAppState(filePath);

    expect(restored.schedule).toEqual([sampleEntry()]);
  });

  it("loads legacy state files without a schedule field as an empty schedule", async () => {
    const filePath = await makeStateFile();
    const legacy = { ...createSeedState() } as Record<string, unknown>;
    delete legacy.schedule;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(legacy), "utf8");

    const restored = await loadAppState(filePath);

    expect(restored.schedule).toEqual([]);
  });
});

describe("createScheduleEntry", () => {
  it("appends the entry and persists it", async () => {
    const filePath = await makeStateFile();
    await saveAppState(filePath, { ...createSeedState(), schedule: [] });

    const created = await createScheduleEntry(sampleEntry(), filePath);

    expect(created.id).toBe("sched-1");
    const raw = JSON.parse(await readFile(filePath, "utf8"));
    expect(raw.schedule).toHaveLength(1);
    expect(raw.schedule[0].title).toBe("Deep work");
  });
});

describe("updateScheduleEntry", () => {
  it("patches fields and bumps updatedAt", async () => {
    const filePath = await makeStateFile();
    await saveAppState(filePath, { ...createSeedState(), schedule: [sampleEntry()] });

    const updated = await updateScheduleEntry(
      "sched-1",
      { status: "done", endTime: "11:00" },
      filePath,
    );

    expect(updated?.status).toBe("done");
    expect(updated?.endTime).toBe("11:00");
    expect(updated?.updatedAt).not.toBe(sampleEntry().updatedAt);
  });

  it("returns null for an unknown id", async () => {
    const filePath = await makeStateFile();
    await saveAppState(filePath, { ...createSeedState(), schedule: [] });

    expect(await updateScheduleEntry("sched-missing", { title: "x" }, filePath)).toBeNull();
  });
});

describe("deleteScheduleEntry", () => {
  it("removes the entry", async () => {
    const filePath = await makeStateFile();
    await saveAppState(filePath, { ...createSeedState(), schedule: [sampleEntry()] });

    expect(await deleteScheduleEntry("sched-1", filePath)).toBe(true);
    const restored = await loadAppState(filePath);
    expect(restored.schedule).toEqual([]);
  });

  it("returns false for an unknown id", async () => {
    const filePath = await makeStateFile();
    await saveAppState(filePath, { ...createSeedState(), schedule: [] });

    expect(await deleteScheduleEntry("sched-missing", filePath)).toBe(false);
  });
});

describe("listSchedule", () => {
  it("filters by inclusive date range and sorts by date + start time", async () => {
    const filePath = await makeStateFile();
    await saveAppState(filePath, {
      ...createSeedState(),
      schedule: [
        sampleEntry({ id: "s3", date: "2026-07-18", startTime: "08:00" }),
        sampleEntry({ id: "s1", date: "2026-07-16", startTime: "12:00" }),
        sampleEntry({ id: "s2", date: "2026-07-16", startTime: "09:00" }),
        sampleEntry({ id: "s0", date: "2026-07-10", startTime: "09:00" }),
      ],
    });

    const listed = await listSchedule(
      { from: "2026-07-16", to: "2026-07-18" },
      filePath,
    );

    expect(listed.map((e) => e.id)).toEqual(["s2", "s1", "s3"]);
  });
});

describe("resetAllData", () => {
  it("wipes projects, logs, and schedule entries", async () => {
    const filePath = await makeStateFile();
    await saveAppState(filePath, { ...createSeedState(), schedule: [sampleEntry()] });

    await resetAllData(filePath);
    const restored = await loadAppState(filePath);

    expect(restored.projects).toEqual([]);
    expect(restored.progressLogs).toEqual([]);
    expect(restored.schedule).toEqual([]);
  });
});

describe("deleteProject with linked schedule entries", () => {
  it("keeps the entries but clears their projectId", async () => {
    const filePath = await makeStateFile();
    const seed = createSeedState();
    const projectId = seed.projects[0]!.id;
    await saveAppState(filePath, {
      ...seed,
      schedule: [sampleEntry({ projectId })],
    });

    await deleteProject(projectId, filePath);
    const restored = await loadAppState(filePath);

    expect(restored.schedule).toHaveLength(1);
    expect(restored.schedule[0]?.projectId).toBeUndefined();
  });
});
