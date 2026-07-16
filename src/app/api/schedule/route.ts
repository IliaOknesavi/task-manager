import { loadAppState, createScheduleEntry, listSchedule } from "@/lib/storage";
import { dateSchema, scheduleEntryInput, buildScheduleEntry } from "@/lib/schedule-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const parseDate = (value: string | null) =>
      value === null ? undefined : dateSchema.parse(value);
    const date = parseDate(searchParams.get("date"));
    const from = date ?? parseDate(searchParams.get("from"));
    const to = date ?? parseDate(searchParams.get("to"));

    const entries = await listSchedule({ from, to });
    return Response.json(entries);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = scheduleEntryInput.parse(body);
    const state = await loadAppState();
    const entry = buildScheduleEntry(input, state.projects);
    const created = await createScheduleEntry(entry);

    return Response.json(created, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
