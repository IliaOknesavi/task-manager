import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForTokens = vi.fn();

vi.mock("@/lib/google-calendar", () => ({
  exchangeCodeForTokens,
}));

describe("GET /api/google-calendar/callback", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.TASK_MANAGER_STATE_FILE;
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("saves a refresh token and redirects to the connected state", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "taskmanager-calendar-"));
    tempDirs.push(directory);
    process.env.TASK_MANAGER_STATE_FILE = path.join(directory, "state.json");

    exchangeCodeForTokens.mockResolvedValue({
      refresh_token: "refresh-token-123",
    });

    const { GET } = await import("@/app/api/google-calendar/callback/route");
    const response = await GET(
      new Request(
        "http://127.0.0.1:3000/api/google-calendar/callback?code=test-code",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/?calendar=connected",
    );

    const { loadAppState } = await import("@/lib/storage");
    const state = await loadAppState(process.env.TASK_MANAGER_STATE_FILE);

    expect(state.googleCalendar).toMatchObject({
      connected: true,
      calendarId: "primary",
      refreshToken: "refresh-token-123",
    });
  });
});
