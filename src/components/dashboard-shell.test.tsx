import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardShell } from "@/components/dashboard-shell";
import type { AppState } from "@/lib/domain";

const state: AppState = {
  currentProjectId: "proj-codex",
  googleCalendar: {
    connected: true,
    calendarId: "primary",
    lastSyncedAt: "2026-04-22T10:00:00.000Z",
  },
  googleDrive: { connected: false },
  projects: [
    {
      id: "proj-codex",
      name: "Codex bridge",
      emoji: "🤖",
      status: "in-progress",
      priority: "ultra-high",
      startDate: "2026-04-22",
      dueDate: "2026-04-25",
      progress: 58,
      codexEnabled: true,
      relatedProjectIds: [],
      notesCount: 4,
      updatedAt: "2026-04-22T10:00:00.000Z",
    },
    {
      id: "proj-gantt",
      name: "Timeline polish",
      emoji: "📈",
      status: "not-started",
      priority: "medium",
      startDate: "2026-04-24",
      dueDate: "2026-04-29",
      progress: 0,
      codexEnabled: false,
      relatedProjectIds: [],
      notesCount: 1,
      updatedAt: "2026-04-21T08:00:00.000Z",
    },
    {
      id: "proj-release",
      name: "Ship v1",
      emoji: "🚀",
      status: "done",
      priority: "high",
      startDate: "2026-04-16",
      dueDate: "2026-04-21",
      progress: 100,
      codexEnabled: false,
      relatedProjectIds: [],
      notesCount: 3,
      updatedAt: "2026-04-21T20:00:00.000Z",
    },
  ],
  progressLogs: [
    {
      id: "log-1",
      projectId: "proj-codex",
      summary: "Created progress endpoint.",
      minutes: 45,
      source: "codex",
      createdAt: "2026-04-22T09:00:00.000Z",
    },
  ],
};

describe("DashboardShell", () => {
  it("renders the requested views and focus project for Codex logging", () => {
    render(<DashboardShell initialState={state} />);

    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "By Status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "By Priority" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gantt" })).toBeInTheDocument();
    expect(screen.getByText("Codex focus")).toBeInTheDocument();
    expect(screen.getAllByText("Codex bridge").length).toBeGreaterThan(0);
  });

  it("switches to the priority view on demand", () => {
    render(<DashboardShell initialState={state} />);

    fireEvent.click(screen.getAllByRole("button", { name: "By Priority" })[0]!);

    expect(screen.getAllByText("Ultra-high").length).toBeGreaterThan(0);
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Medium").length).toBeGreaterThan(0);
  });
});
