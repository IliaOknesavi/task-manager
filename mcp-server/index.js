#!/usr/bin/env node
/**
 * Task Manager MCP Server
 * Proxies requests to the Task Manager API (Railway or local).
 */

const TASK_MANAGER_URL = process.env.TASK_MANAGER_URL || "https://task-manager-production-1073.up.railway.app";

async function callApi(op) {
  const response = await fetch(`${TASK_MANAGER_URL}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(op),
  });
  return response.json();
}

const tools = [
  {
    name: "list_projects",
    description: "Получить список всех проектов",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_project",
    description: "Получить один проект по ID",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID проекта" } },
      required: ["id"],
    },
  },
  {
    name: "create_project",
    description: "Создать новый проект",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        emoji: { type: "string" },
        status: { type: "string", enum: ["not-started", "in-progress", "done"] },
        priority: { type: "string", enum: ["ultra-high", "high", "medium", "low", "no-priority"] },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["name"],
    },
  },
  {
    name: "update_project",
    description: "Обновить проект",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        patch: { type: "object" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_project",
    description: "Удалить проект",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "read_notes",
    description: "Прочитать заметки проекта",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "write_notes",
    description: "Записать заметки проекта",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        content: { type: "string" },
      },
      required: ["id", "content"],
    },
  },
  {
    name: "log_progress",
    description: "Залогировать прогресс по проекту",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        summary: { type: "string" },
        minutes: { type: "number" },
        progressDelta: { type: "number" },
      },
      required: ["projectId", "summary", "minutes"],
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case "list_projects":
      return callApi({ op: "list" });
    case "get_project":
      return callApi({ op: "get", id: args.id });
    case "create_project":
      return callApi({ op: "create", project: args });
    case "update_project":
      return callApi({ op: "update", id: args.id, patch: args.patch });
    case "delete_project":
      return callApi({ op: "delete", id: args.id });
    case "read_notes":
      return callApi({ op: "read_notes", id: args.id });
    case "write_notes":
      return callApi({ op: "write_notes", id: args.id, content: args.content });
    case "log_progress":
      return callApi({
        op: "log_progress",
        projectId: args.projectId,
        summary: args.summary,
        minutes: args.minutes,
        progressDelta: args.progressDelta,
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// MCP stdio transport
process.stdin.setEncoding("utf8");
let buffer = "";

process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      await handleMessage(msg);
    } catch (e) {
      // ignore parse errors
    }
  }
});

async function handleMessage(msg) {
  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "task-manager", version: "1.0.0" },
      },
    });
  } else if (msg.method === "tools/list") {
    send({ jsonrpc: "2.0", id: msg.id, result: { tools } });
  } else if (msg.method === "tools/call") {
    try {
      const result = await handleToolCall(msg.params.name, msg.params.arguments || {});
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        },
      });
    } catch (e) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32000, message: e.message },
      });
    }
  } else if (msg.method === "notifications/initialized") {
    // no response needed
  } else if (msg.id !== undefined) {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32601, message: "Method not found" },
    });
  }
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
