import { z } from "zod";

import { recordProgress } from "@/lib/storage";

const progressSchema = z.object({
  projectId: z.string(),
  summary: z.string().min(1),
  minutes: z.number().int().min(1),
  progressDelta: z.number().int().optional(),
  source: z.enum(["codex", "manual", "calendar"]),
});

export async function POST(request: Request) {
  const body = await request.json();
  const input = progressSchema.parse(body);
  const state = await recordProgress({
    ...input,
    createdAt: new Date().toISOString(),
  });

  return Response.json(state);
}
