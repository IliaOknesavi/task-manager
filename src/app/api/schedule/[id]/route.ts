import { loadAppState, updateScheduleEntry, deleteScheduleEntry } from "@/lib/storage";
import { scheduleEntryPatch, normalizeSchedulePatch } from "@/lib/schedule-api";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const input = scheduleEntryPatch.parse(body);

    const state = await loadAppState();
    const existing = state.schedule.find((e) => e.id === id);
    if (!existing) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const patch = normalizeSchedulePatch(input, existing, state.projects);
    const updated = await updateScheduleEntry(id, patch);
    if (!updated) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteScheduleEntry(id);

  if (!ok) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
