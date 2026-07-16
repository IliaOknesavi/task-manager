import { fireEvent, render, screen } from "@testing-library/react";
import { format } from "date-fns";
import { describe, expect, it } from "vitest";

import { DashboardShell } from "@/components/dashboard-shell";
import type { AppState } from "@/lib/domain";

const state: AppState = {
  currentProjectId: "proj-codex",
  googleCalendar: { connected: false },
  googleDrive: { connected: false },
  projects: [
    {
      id: "proj-codex",
      name: "Codex bridge",
      emoji: "🤖",
      status: "in-progress",
      priority: "ultra-high",
      startDate: "2026-07-16",
      dueDate: "2026-07-20",
      progress: 58,
      codexEnabled: true,
      relatedProjectIds: [],
      notesCount: 4,
      updatedAt: "2026-07-16T10:00:00.000Z",
    },
  ],
  progressLogs: [],
  schedule: [
    {
      id: "sched-morning",
      date: format(new Date(), "yyyy-MM-dd"), // local today → visible by default
      startTime: "09:00",
      endTime: "10:30",
      title: "Morning deep work",
      note: "no meetings",
      projectId: "proj-codex",
      status: "planned",
      createdAt: "2026-07-16T08:00:00.000Z",
      updatedAt: "2026-07-16T08:00:00.000Z",
    },
  ],
};

describe("Schedule view", () => {
  it("shows a Schedule tab and renders today's entries on it", () => {
    render(<DashboardShell initialState={state} />);

    const tab = screen.getByRole("button", { name: "Schedule" });
    fireEvent.click(tab);

    expect(screen.getByText("Morning deep work")).toBeInTheDocument();
    // hour labels of the grid
    expect(screen.getByText("09:00")).toBeInTheDocument();
    // linked project shown on the entry card
    expect(screen.getAllByText(/Codex bridge/).length).toBeGreaterThan(0);
  });
});
