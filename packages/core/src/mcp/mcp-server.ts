/**
 * @module mcp
 * RFC-1.0.1 §17 Layer 4 — MCP server exposing Conitens operations as tools.
 *
 * CLI agents connect to this MCP server to interact with the Conitens
 * orchestrator programmatically (create tasks, submit commands, query state).
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface McpServerConfig {
  conitensDir: string;
  eventsDir: string;
}

export class ContinensMcpServer {
  private readonly config: McpServerConfig;
  private tools = new Map<string, McpTool>();

  constructor(config: McpServerConfig) {
    this.config = config;
    this.registerDefaultTools();
  }

  /**
   * Register the default Conitens tools.
   */
  private registerDefaultTools(): void {
    this.registerTool({
      name: "create_task",
      description: "Create a new task in the Conitens system",
      inputSchema: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "Unique task identifier" },
          title: { type: "string", description: "Task title" },
          run_id: { type: "string", description: "Run identifier" },
          actor_id: { type: "string", description: "Actor creating the task" },
        },
        required: ["task_id", "title"],
      },
      handler: async (params) => {
        return {
          stub: true,
          success: true,
          task_id: params.task_id,
          state: "draft",
          message: `Task ${params.task_id} created`,
        };
      },
    });

    this.registerTool({
      name: "assign_task",
      description: "Assign a task to an agent",
      inputSchema: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "Task to assign" },
          assignee: { type: "string", description: "Agent to assign to" },
        },
        required: ["task_id", "assignee"],
      },
      handler: async (params) => {
        return {
          stub: true,
          success: true,
          task_id: params.task_id,
          assignee: params.assignee,
          message: `Task ${params.task_id} assigned to ${params.assignee}`,
        };
      },
    });

    this.registerTool({
      name: "list_tasks",
      description: "List all tasks with their current state",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        return {
          stub: true,
          success: true,
          tasks: [],
          message: "Task list retrieved",
        };
      },
    });

    this.registerTool({
      name: "get_task_status",
      description: "Get the current status of a specific task",
      inputSchema: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "Task identifier" },
        },
        required: ["task_id"],
      },
      handler: async (params) => {
        return {
          stub: true,
          success: true,
          task_id: params.task_id,
          message: `Status for ${params.task_id} retrieved`,
        };
      },
    });

    this.registerTool({
      name: "submit_command",
      description: "Submit a raw command to the orchestrator",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Event type" },
          task_id: { type: "string", description: "Related task ID" },
          payload: { type: "object", description: "Command payload" },
        },
        required: ["type"],
      },
      handler: async (params) => {
        return {
          stub: true,
          success: true,
          type: params.type,
          message: `Command ${params.type} submitted`,
        };
      },
    });
  }

  /**
   * Register a custom tool.
   */
  registerTool(tool: McpTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get all registered tools (for MCP tool listing).
   */
  listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return [...this.tools.values()].map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  /**
   * Execute a tool by name.
   */
  async executeTool(name: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.handler(params);
  }

  /**
   * Handle an MCP request (stdio transport protocol).
   */
  async handleRequest(request: {
    method: string;
    params?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    switch (request.method) {
      case "tools/list":
        return { tools: this.listTools() };

      case "tools/call": {
        const toolName = request.params?.name as string;
        const toolParams = (request.params?.arguments ?? {}) as Record<string, unknown>;
        const result = await this.executeTool(toolName, toolParams);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      default:
        throw new Error(`Unknown method: ${request.method}`);
    }
  }
}
