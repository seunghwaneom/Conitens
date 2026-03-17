import { describe, it, expect, beforeEach } from "vitest";
import { ContinensMcpServer } from "../src/mcp/mcp-server.js";

describe("ContinensMcpServer", () => {
  let server: ContinensMcpServer;

  beforeEach(() => {
    server = new ContinensMcpServer({
      conitensDir: "/tmp/test/.conitens",
      eventsDir: "/tmp/test/.conitens/events",
    });
  });

  it("lists default tools", () => {
    const tools = server.listTools();
    expect(tools.length).toBe(5);
    const names = tools.map(t => t.name);
    expect(names).toContain("create_task");
    expect(names).toContain("assign_task");
    expect(names).toContain("list_tasks");
    expect(names).toContain("get_task_status");
    expect(names).toContain("submit_command");
  });

  it("executes create_task tool", async () => {
    const result = await server.executeTool("create_task", {
      task_id: "task-0001",
      title: "Test task",
    });
    expect(result.success).toBe(true);
    expect(result.task_id).toBe("task-0001");
    expect(result.state).toBe("draft");
  });

  it("executes assign_task tool", async () => {
    const result = await server.executeTool("assign_task", {
      task_id: "task-0001",
      assignee: "claude",
    });
    expect(result.success).toBe(true);
    expect(result.assignee).toBe("claude");
  });

  it("throws on unknown tool", async () => {
    await expect(
      server.executeTool("nonexistent", {}),
    ).rejects.toThrow("Unknown tool");
  });

  it("handles tools/list MCP request", async () => {
    const response = await server.handleRequest({ method: "tools/list" });
    expect(Array.isArray(response.tools)).toBe(true);
    expect((response.tools as unknown[]).length).toBe(5);
  });

  it("handles tools/call MCP request", async () => {
    const response = await server.handleRequest({
      method: "tools/call",
      params: {
        name: "create_task",
        arguments: { task_id: "task-mcp", title: "MCP test" },
      },
    });
    expect(Array.isArray(response.content)).toBe(true);
  });

  it("registers custom tools", () => {
    server.registerTool({
      name: "custom_tool",
      description: "A custom tool",
      inputSchema: { type: "object", properties: {} },
      handler: async () => ({ custom: true }),
    });

    const tools = server.listTools();
    expect(tools.map(t => t.name)).toContain("custom_tool");
  });
});
