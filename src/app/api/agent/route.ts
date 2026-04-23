import { z } from "zod";
import {
  loadAppState,
  saveAppState,
  createProject,
  updateProject,
  deleteProject,
  recordProgress,
  buildProjectMdContent,
  getProjectNotes,
  setProjectNotes,
} from "@/lib/storage";
import type { Project, ProgressInput } from "@/lib/domain";

// Slugify helper
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Operation schemas
const listOp = z.object({ op: z.literal("list") });
const getOp = z.object({ op: z.literal("get"), id: z.string() });
const createOp = z.object({
  op: z.literal("create"),
  project: z.object({
    name: z.string(),
    emoji: z.string().optional(),
    status: z.enum(["not-started", "in-progress", "done"]).optional(),
    priority: z.enum(["ultra-high", "high", "medium", "low", "no-priority"]).optional(),
    tags: z.array(z.string()).optional(),
    codexEnabled: z.boolean().optional(),
  }),
});
const updateOp = z.object({
  op: z.literal("update"),
  id: z.string(),
  patch: z.record(z.string(), z.any()).optional(),
});
const deleteOp = z.object({ op: z.literal("delete"), id: z.string() });
const readNotesOp = z.object({ op: z.literal("read_notes"), id: z.string() });
const writeNotesOp = z.object({
  op: z.literal("write_notes"),
  id: z.string(),
  content: z.string(),
});
const logProgressOp = z.object({
  op: z.literal("log_progress"),
  projectId: z.string(),
  summary: z.string(),
  minutes: z.number(),
  progressDelta: z.number().optional(),
});

const operationSchema = z.union([
  listOp,
  getOp,
  createOp,
  updateOp,
  deleteOp,
  readNotesOp,
  writeNotesOp,
  logProgressOp,
]);

type Operation = z.infer<typeof operationSchema>;

async function handleOperation(op: Operation): Promise<any> {
  switch (op.op) {
    case "list": {
      const state = await loadAppState();
      return state.projects;
    }

    case "get": {
      const state = await loadAppState();
      const project = state.projects.find((p) => p.id === op.id);
      if (!project) {
        throw new Error(`Project ${op.id} not found`);
      }
      return project;
    }

    case "create": {
      const state = await loadAppState();
      const id = `proj-${slugify(op.project.name)}-${Date.now().toString(36)}`;
      const newProject: Project = {
        id,
        name: op.project.name,
        emoji: op.project.emoji,
        status: op.project.status ?? "not-started",
        priority: op.project.priority ?? "medium",
        progress: 0,
        codexEnabled: op.project.codexEnabled ?? false,
        relatedProjectIds: [],
        notesCount: 0,
        updatedAt: new Date().toISOString(),
        tags: op.project.tags,
      };

      const updated = {
        ...state,
        projects: [...state.projects, newProject],
      };
      await saveAppState(undefined, updated);

      // fire-and-forget: create notes
      setProjectNotes(newProject.id, buildProjectMdContent(newProject)).catch(() => {});

      return newProject;
    }

    case "update": {
      const patched = await updateProject(op.id, op.patch || {});
      if (!patched) {
        throw new Error(`Project ${op.id} not found`);
      }
      return patched;
    }

    case "delete": {
      const ok = await deleteProject(op.id);
      if (!ok) {
        throw new Error(`Project ${op.id} not found`);
      }
      return { ok: true };
    }

    case "read_notes": {
      const content = await getProjectNotes(op.id);
      if (!content) {
        const state = await loadAppState();
        const project = state.projects.find((p) => p.id === op.id);
        if (!project) throw new Error(`Project ${op.id} not found`);
        return { content: buildProjectMdContent(project) };
      }
      return { content };
    }

    case "write_notes": {
      await setProjectNotes(op.id, op.content);
      return { ok: true };
    }

    case "log_progress": {
      const input: ProgressInput = {
        projectId: op.projectId,
        summary: op.summary,
        minutes: op.minutes,
        source: "codex",
        createdAt: new Date().toISOString(),
        ...(typeof op.progressDelta === "number" && { progressDelta: op.progressDelta }),
      };
      const state = await recordProgress(input);
      return state;
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Support both single operation and array of operations
    let operations: Operation[];
    if (Array.isArray(body.operations)) {
      operations = body.operations.map((op: any) => operationSchema.parse(op));
    } else {
      // Single operation
      operations = [operationSchema.parse(body)];
    }

    const results = [];
    for (const op of operations) {
      try {
        const result = await handleOperation(op);
        results.push(result);
      } catch (error) {
        results.push({ error: (error as Error).message });
      }
    }

    // Return single result if single operation, array if multiple
    if (operations.length === 1) {
      const result = results[0];
      if (result?.error) {
        return Response.json(result, { status: 400 });
      }
      return Response.json(result);
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
