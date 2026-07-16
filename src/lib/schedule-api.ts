import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { Project, ScheduleEntry } from "@/lib/domain";

// Shared validation + construction logic for schedule entries,
// used by both /api/agent (schedule_* ops) and the /api/schedule REST routes.

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year!, month! - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month! - 1 &&
      parsed.getUTCDate() === day
    );
  }, "not a real calendar date");
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM (24h)");

export const scheduleEntryInput = z
  .object({
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    title: z.string().min(1),
    note: z.string().optional(),
    projectId: z.string().min(1).optional(),
    status: z.enum(["planned", "done", "skipped"]).optional(),
  })
  .refine((e) => e.endTime > e.startTime, {
    message: "endTime must be after startTime",
  });

export const scheduleEntryPatch = z
  .object({
    date: dateSchema.optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    title: z.string().min(1).optional(),
    note: z.string().nullable().optional(),
    projectId: z.string().min(1).nullable().optional(),
    status: z.enum(["planned", "done", "skipped"]).optional(),
  })
  .refine(
    (p) => !(p.startTime && p.endTime) || p.endTime > p.startTime,
    { message: "endTime must be after startTime" },
  );

export type ScheduleEntryInput = z.infer<typeof scheduleEntryInput>;
export type ScheduleEntryPatchInput = z.infer<typeof scheduleEntryPatch>;

export const buildScheduleEntry = (
  input: ScheduleEntryInput,
  projects: Project[],
): ScheduleEntry => {
  if (input.projectId && !projects.some((p) => p.id === input.projectId)) {
    throw new Error(`Project ${input.projectId} not found`);
  }
  const now = new Date().toISOString();
  return {
    id: `sched-${randomUUID()}`,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    title: input.title,
    note: input.note,
    projectId: input.projectId,
    status: input.status ?? "planned",
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Converts an API patch (where null clears a field and absent leaves it
 * untouched) into a storage patch, validating project links and the merged
 * time range against the existing entry.
 */
export const normalizeSchedulePatch = (
  input: ScheduleEntryPatchInput,
  existing: ScheduleEntry,
  projects: Project[],
): Partial<Omit<ScheduleEntry, "id">> => {
  const patch: Partial<Omit<ScheduleEntry, "id">> = {};

  if (input.date !== undefined) patch.date = input.date;
  if (input.startTime !== undefined) patch.startTime = input.startTime;
  if (input.endTime !== undefined) patch.endTime = input.endTime;
  if (input.title !== undefined) patch.title = input.title;
  if (input.status !== undefined) patch.status = input.status;
  if (input.note !== undefined) patch.note = input.note ?? undefined;
  if (input.projectId !== undefined) {
    if (input.projectId && !projects.some((p) => p.id === input.projectId)) {
      throw new Error(`Project ${input.projectId} not found`);
    }
    patch.projectId = input.projectId ?? undefined;
  }

  const startTime = patch.startTime ?? existing.startTime;
  const endTime = patch.endTime ?? existing.endTime;
  if (endTime <= startTime) {
    throw new Error("endTime must be after startTime");
  }

  return patch;
};
