import { z } from "zod";

import { createProject } from "@/lib/storage";

const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  emoji: z.string().optional(),
  status: z.enum(["not-started", "in-progress", "done"]),
  priority: z.enum(["ultra-high", "high", "medium", "low", "no-priority"]),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  progress: z.number().int().min(0).max(100),
  codexEnabled: z.boolean(),
  relatedProjectIds: z.array(z.string()),
  notesCount: z.number().int().min(0),
  updatedAt: z.string(),
  tags: z.array(z.string()).optional(),
});

import { loadAppState } from "@/lib/storage";

export async function POST(request: Request) {
  const body = await request.json();
  const project = projectSchema.parse(body);
  const created = await createProject(project);

  return Response.json(created, { status: 201 });
}

export async function GET() {
  const state = await loadAppState();
  return Response.json(state.projects);
}
