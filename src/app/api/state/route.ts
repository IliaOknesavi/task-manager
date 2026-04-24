import { loadAppState } from "@/lib/storage";

export async function GET() {
  const state = await loadAppState();
  return Response.json(state);
}
