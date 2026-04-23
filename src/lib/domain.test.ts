import { describe, expect, it } from "vitest";

import {
  appendProgressLog,
  buildCalendarOperations,
  calculateDashboardStats,
  groupProjectsByPriority,
  groupProjectsByStatus,
  type AppState,
} from "@/lib/domain";

const baseState: AppState = {
  currentProjectId: "proj-platform",
  googleCalendar: {
    connected: true,
    calendarId: "primary",
    lastSyncedAt: "2026-04-22T08:00:00.000Z",
  },
  googleDrive: { connected: false },
  projects: [
    {
      id: "proj-platform",
      name: "Task Manager platform",
      emoji: "🧠",
      status: "in-progress",
      priority: "ultra-high",
      startDate: "2026-04-20",
      dueDate: "2026-04-30",
      progress: 35,
      codexEnabled: true,
      relatedProjectIds: ["proj-calendar"],
      notesCount: 3,
      updatedAt: "2026-04-22T08:00:00.000Z",
      calendarEventId: "evt-platform",
    },
    {
      id: "proj-calendar",
      name: "Google Calendar sync",
      emoji: "📆",
      status: "not-started",
      priority: "high",
      startDate: "2026-04-23",
      dueDate: "2026-04-28",
      progress: 0,
      codexEnabled: true,
      relatedProjectIds: [],
      notesCount: 1,
      updatedAt: "2026-04-20T07:00:00.000Z",
    },
    {
      id: "proj-ui",
      name: "Board and Gantt polish",
      emoji: "🎛️",
      status: "not-started",
      priority: "medium",
      startDate: "2026-04-24",
      dueDate: "2026-05-02",
      progress: 0,
      codexEnabled: false,
      relatedProjectIds: ["proj-platform"],
      notesCount: 0,
      updatedAt: "2026-04-18T07:00:00.000Z",
    },
    {
      id: "proj-release",
      name: "Launch v1",
      emoji: "🚀",
      status: "done",
      priority: "high",
      startDate: "2026-04-10",
      dueDate: "2026-04-22",
      progress: 100,
      codexEnabled: false,
      relatedProjectIds: [],
      notesCount: 4,
      updatedAt: "2026-04-22T06:00:00.000Z",
      calendarEventId: "evt-release",
    },
  ],
  progressLogs: [
    {
      id: "log-1",
      projectId: "proj-platform",
      summary: "Scaffolded architecture and navigation.",
      minutes: 50,
      source: "codex",
      createdAt: "2026-04-20T09:15:00.000Z",
    },
    {
      id: "log-2",
      projectId: "proj-release",
      summary: "Closed acceptance checklist.",
      minutes: 35,
      source: "manual",
      createdAt: "2026-04-21T14:00:00.000Z",
    },
    {
      id: "log-3",
      projectId: "proj-platform",
      summary: "Implemented task analytics widgets.",
      minutes: 85,
      source: "codex",
      createdAt: "2026-04-22T07:45:00.000Z",
    },
  ],
};

describe("groupProjectsByStatus", () => {
  it("builds status columns in the intended UI order with counts", () => {
    const columns = groupProjectsByStatus(baseState.projects);

    expect(columns.map((column) => column.status)).toEqual([
      "not-started",
      "in-progress",
      "done",
    ]);
    expect(columns.map((column) => column.count)).toEqual([2, 1, 1]);
    expect(columns[0].projects.map((project) => project.id)).toEqual([
      "proj-calendar",
      "proj-ui",
    ]);
  });
});

describe("groupProjectsByPriority", () => {
  it("builds priority columns and keeps empty buckets for fast capture", () => {
    const columns = groupProjectsByPriority(baseState.projects);

    expect(columns.map((column) => column.priority)).toEqual([
      "ultra-high",
      "high",
      "medium",
      "low",
      "no-priority",
    ]);
    expect(columns.map((column) => column.count)).toEqual([1, 2, 1, 0, 0]);
    expect(columns[1].projects.map((project) => project.id)).toEqual([
      "proj-calendar",
      "proj-release",
    ]);
  });
});

describe("calculateDashboardStats", () => {
  it("derives headline metrics, streak, xp, level, and achievements", () => {
    const stats = calculateDashboardStats(baseState, "2026-04-22T12:00:00.000Z");

    expect(stats.totalProjects).toBe(4);
    expect(stats.completedProjects).toBe(1);
    expect(stats.completionRate).toBe(25);
    expect(stats.activeProjects).toBe(1);
    expect(stats.codexTrackedProjects).toBe(2);
    expect(stats.totalLoggedMinutes).toBe(170);
    expect(stats.currentStreakDays).toBe(3);
    expect(stats.xp).toBe(350);
    expect(stats.level).toBe(4);
    expect(stats.focusProject?.id).toBe("proj-platform");
    expect(stats.achievements.map((achievement) => achievement.title)).toEqual([
      "Deep Work",
      "Shipped",
      "Codex Loop",
    ]);
  });
});

describe("appendProgressLog", () => {
  it("records Codex progress, moves a task into progress, and updates completion percentage", () => {
    const nextState = appendProgressLog(baseState, {
      projectId: "proj-calendar",
      summary: "Connected OAuth callback and sync preparation.",
      minutes: 55,
      progressDelta: 18,
      source: "codex",
      createdAt: "2026-04-22T09:30:00.000Z",
    });

    const updatedProject = nextState.projects.find(
      (project) => project.id === "proj-calendar",
    );

    expect(updatedProject).toMatchObject({
      status: "in-progress",
      progress: 18,
      updatedAt: "2026-04-22T09:30:00.000Z",
    });
    expect(nextState.progressLogs.at(-1)).toMatchObject({
      projectId: "proj-calendar",
      source: "codex",
      minutes: 55,
    });
  });
});

describe("buildCalendarOperations", () => {
  it("creates upsert payloads for scheduled unfinished projects", () => {
    const operations = buildCalendarOperations(baseState.projects, "primary");

    expect(operations).toHaveLength(3);
    expect(operations[0]).toMatchObject({
      projectId: "proj-platform",
      mode: "update",
      calendarId: "primary",
      eventId: "evt-platform",
      summary: "🧠 Task Manager platform",
    });
    expect(operations[1]).toMatchObject({
      projectId: "proj-calendar",
      mode: "create",
      calendarId: "primary",
      eventId: undefined,
      summary: "📆 Google Calendar sync",
    });
    expect(operations[2]).toMatchObject({
      projectId: "proj-ui",
      mode: "create",
      calendarId: "primary",
      summary: "🎛️ Board and Gantt polish",
    });
  });
});
