import path from "node:path";
import { unlink } from "node:fs/promises";
import { z } from "zod";

import { updateProject, deleteProject, getTasksDir } from "@/lib/storage";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  emoji: z.string().optional(),
  status: z.enum(["not-started", "in-progress", "done"]).optional(),
  priority: z.enum(["ultra-high", "high", "medium", "low", "no-priority"]).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  codexEnabled: z.boolean().optional(),
  relatedProjectIds: z.array(z.string()).optional(),
  notesCount: z.number().int().min(0).optional(),
  tags: z.array(z.string()).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const patch = patchSchema.parse(body);
  const updated = await updateProject(id, patch);

  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteProject(id);

  if (!ok) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Best-effort: remove local MD file
  try {
    await unlink(path.join(getTasksDir(), `${id}.md`));
  } catch { /* ignore */ }

  return Response.json({ ok: true });
}
