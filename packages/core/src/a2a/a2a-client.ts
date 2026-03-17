/**
 * @module a2a
 * RFC-1.0.1 §17 Layer 5 — A2A (Agent-to-Agent) protocol client.
 *
 * Enables federation with remote Conitens instances or A2A-compatible agents.
 */

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  capabilities: string[];
  version: string;
}

export interface A2ATask {
  id: string;
  title: string;
  description: string;
  status: "pending" | "accepted" | "completed" | "failed";
  result?: unknown;
}

export interface A2AMessage {
  from: string;
  to: string;
  type: "task_request" | "task_response" | "status_query" | "status_response";
  payload: Record<string, unknown>;
  timestamp: string;
}

export class A2AClient {
  private readonly localAgent: AgentCard;
  private remoteAgents = new Map<string, AgentCard>();
  private pendingTasks = new Map<string, A2ATask>();

  constructor(localAgent: AgentCard) {
    this.localAgent = localAgent;
  }

  /**
   * Register a remote agent by its agent card.
   */
  registerRemoteAgent(card: AgentCard): void {
    this.remoteAgents.set(card.name, card);
  }

  /**
   * Discover available remote agents.
   */
  listRemoteAgents(): AgentCard[] {
    return [...this.remoteAgents.values()];
  }

  /**
   * Get the local agent card (for sharing with remote agents).
   */
  getLocalCard(): AgentCard {
    return { ...this.localAgent };
  }

  /**
   * Send a task to a remote agent.
   */
  async sendTask(remoteName: string, task: Omit<A2ATask, "status">): Promise<A2ATask> {
    const remote = this.remoteAgents.get(remoteName);
    if (!remote) {
      throw new Error(`Unknown remote agent: ${remoteName}`);
    }

    const a2aTask: A2ATask = {
      ...task,
      status: "pending",
    };
    this.pendingTasks.set(task.id, a2aTask);

    // In production: HTTP POST to remote.url with A2A protocol
    // For now: return the pending task
    return a2aTask;
  }

  /**
   * Get status of a pending task.
   */
  getTaskStatus(taskId: string): A2ATask | null {
    return this.pendingTasks.get(taskId) ?? null;
  }

  /**
   * Handle an incoming A2A message.
   */
  async handleMessage(message: A2AMessage): Promise<A2AMessage | null> {
    switch (message.type) {
      case "task_request":
        return {
          from: this.localAgent.name,
          to: message.from,
          type: "task_response",
          payload: { accepted: true, task_id: message.payload["task_id"] },
          timestamp: new Date().toISOString(),
        };

      case "status_query": {
        const task = this.pendingTasks.get(message.payload["task_id"] as string);
        return {
          from: this.localAgent.name,
          to: message.from,
          type: "status_response",
          payload: { task: task ?? null },
          timestamp: new Date().toISOString(),
        };
      }

      default:
        return null;
    }
  }
}
