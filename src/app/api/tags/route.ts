import { loadAppState } from "@/lib/storage";

export async function GET() {
  const state = await loadAppState();
  const tags = [...new Set(state.projects.flatMap((p) => p.tags ?? []))].sort();
  return Response.json(tags);
}
