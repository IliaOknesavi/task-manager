/**
 * GET  /api/projects/[id]/notes  — read MD content (file or Postgres)
 * PUT  /api/projects/[id]/notes  — overwrite MD content (file or Postgres)
 */
import { getProjectNotes, setProjectNotes } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const content = await getProjectNotes(id);
  return Response.json({ content });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { content } = await request.json() as { content: string };
  await setProjectNotes(id, content);
  return Response.json({ ok: true });
}
