import { syncStateToGoogleCalendar } from "@/lib/google-calendar";
import { loadAppState, saveAppState } from "@/lib/storage";

export async function POST() {
  try {
    const state = await loadAppState();
    const result = await syncStateToGoogleCalendar(state);
    await saveAppState(undefined, result.state);

    return Response.json({
      synced: result.synced,
      lastSyncedAt: result.lastSyncedAt,
    });
  } catch (error) {
    return Response.json(
      {
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
