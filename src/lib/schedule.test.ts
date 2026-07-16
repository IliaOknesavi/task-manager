import { describe, expect, it } from "vitest";

import {
  timeToMinutes,
  sortScheduleEntries,
  entriesForDate,
  layoutDayEntries,
  type ScheduleEntry,
} from "@/lib/domain";

const entry = (overrides: Partial<ScheduleEntry>): ScheduleEntry => ({
  id: `sched-${overrides.startTime ?? "x"}-${overrides.title ?? "t"}`,
  date: "2026-07-16",
  startTime: "09:00",
  endTime: "10:00",
  title: "Task",
  status: "planned",
  createdAt: "2026-07-16T08:00:00.000Z",
  updatedAt: "2026-07-16T08:00:00.000Z",
  ...overrides,
});

describe("timeToMinutes", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("23:59")).toBe(1439);
  });
});

describe("sortScheduleEntries", () => {
  it("orders by date, then start time, then title", () => {
    const items = [
      entry({ id: "c", date: "2026-07-17", startTime: "08:00", title: "C" }),
      entry({ id: "b", date: "2026-07-16", startTime: "10:00", title: "B" }),
      entry({ id: "a2", date: "2026-07-16", startTime: "09:00", title: "Z" }),
      entry({ id: "a1", date: "2026-07-16", startTime: "09:00", title: "A" }),
    ];

    const sorted = sortScheduleEntries(items);

    expect(sorted.map((e) => e.id)).toEqual(["a1", "a2", "b", "c"]);
  });
});

describe("entriesForDate", () => {
  it("returns only entries for the given date, sorted", () => {
    const items = [
      entry({ id: "other", date: "2026-07-17" }),
      entry({ id: "late", date: "2026-07-16", startTime: "14:00" }),
      entry({ id: "early", date: "2026-07-16", startTime: "08:00" }),
    ];

    expect(entriesForDate(items, "2026-07-16").map((e) => e.id)).toEqual([
      "early",
      "late",
    ]);
  });
});

describe("layoutDayEntries", () => {
  it("gives non-overlapping entries a single full-width lane", () => {
    const items = [
      entry({ id: "a", startTime: "09:00", endTime: "10:00" }),
      entry({ id: "b", startTime: "10:00", endTime: "11:00" }),
    ];

    const laid = layoutDayEntries(items);

    expect(laid.find((l) => l.entry.id === "a")).toMatchObject({ lane: 0, lanes: 1 });
    expect(laid.find((l) => l.entry.id === "b")).toMatchObject({ lane: 0, lanes: 1 });
  });

  it("splits two overlapping entries into two lanes", () => {
    const items = [
      entry({ id: "a", startTime: "09:00", endTime: "11:00" }),
      entry({ id: "b", startTime: "10:00", endTime: "12:00" }),
    ];

    const laid = layoutDayEntries(items);
    const lanes = laid.map((l) => l.lane).sort();

    expect(lanes).toEqual([0, 1]);
    expect(laid.every((l) => l.lanes === 2)).toBe(true);
  });

  it("reuses freed lanes within an overlap cluster", () => {
    const items = [
      entry({ id: "a", startTime: "09:00", endTime: "11:00" }),
      entry({ id: "b", startTime: "10:00", endTime: "12:00" }),
      entry({ id: "c", startTime: "11:30", endTime: "12:30" }),
    ];

    const laid = layoutDayEntries(items);
    const byId = Object.fromEntries(laid.map((l) => [l.entry.id, l]));

    expect(byId.a.lane).toBe(0);
    expect(byId.b.lane).toBe(1);
    expect(byId.c.lane).toBe(0); // "a" ended, lane 0 is free again
    // all three belong to one connected cluster → shared width divisor
    expect(laid.every((l) => l.lanes === 2)).toBe(true);
  });
});
