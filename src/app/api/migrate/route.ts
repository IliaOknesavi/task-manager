/**
 * POST /api/migrate
 * One-time migration from data/task-manager.json → PostgreSQL.
 * Safe to call multiple times (idempotent).
 */
import { migrateFromFile } from "@/lib/storage";

export async function POST() {
  const result = await migrateFromFile();
  return Response.json(result);
}
