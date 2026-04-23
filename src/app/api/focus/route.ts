import { z } from "zod";

import { setCurrentProject } from "@/lib/storage";

const schema = z.object({
  projectId: z.string(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const { projectId } = schema.parse(body);

  await setCurrentProject(projectId);

  return Response.json({ ok: true });
}
