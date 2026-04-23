import { DashboardShell } from "@/components/dashboard-shell";
import { loadAppState } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const state = await loadAppState();

  return <DashboardShell initialState={state} />;
}
