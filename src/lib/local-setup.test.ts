import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = "/Users/hatiko/Documents/TaskManager";

describe("local calendar setup files", () => {
  it("ignores .env.local from version control", async () => {
    const gitignore = await readFile(path.join(projectRoot, ".gitignore"), "utf8");

    expect(gitignore).toContain(".env.local");
  });

  it("provides a local .env.local with Google Calendar credentials", async () => {
    const envFile = await readFile(path.join(projectRoot, ".env.local"), "utf8");

    expect(envFile).toContain("GOOGLE_CLIENT_ID=");
    expect(envFile).toContain("GOOGLE_CLIENT_SECRET=");
    expect(envFile).toContain(
      "GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/google-calendar/callback",
    );
  });

  it("documents the local Google Calendar setup", async () => {
    const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");

    expect(readme).toContain(".env.local");
    expect(readme).toContain("Connect Calendar");
    expect(readme).toContain("GOOGLE_REDIRECT_URI");
    expect(readme).toContain("client_secret");
  });
});
