import {
  forwardArchiveOperatorTask,
  forwardCreateOperatorWorkspace,
  forwardDetachOperatorTaskWorkspace,
  forwardUpdateOperatorWorkspace,
  type ForwardBridgeConfig,
} from "../../forward-bridge.ts";
import type { ForwardRoute } from "../../forward-route.ts";
import {
  buildOperatorWorkspaceMutationBody,
  operatorWorkspaceNeedsArchiveRationale,
  type OperatorWorkspaceDraft,
} from "../../operator-workspace-actions.ts";

type LoadState = "idle" | "loading" | "ready" | "error";

interface WorkspaceCommandResult {
  readonly workspace: {
    readonly workspace_id: string;
  };
}

interface OperatorWorkspaceCommandGateway {
  createWorkspace(config: ForwardBridgeConfig, body: Record<string, unknown>): Promise<WorkspaceCommandResult>;
  updateWorkspace(
    config: ForwardBridgeConfig,
    workspaceId: string,
    body: Record<string, unknown>,
  ): Promise<WorkspaceCommandResult>;
  detachTaskWorkspace(config: ForwardBridgeConfig, taskId: string): Promise<unknown>;
  archiveTask(config: ForwardBridgeConfig, taskId: string, body: Record<string, unknown>): Promise<unknown>;
}

interface OperatorWorkspaceCommandFeedback {
  setMutationState(state: LoadState): void;
  setMutationError(message: string | null): void;
  setTaskActionState(state: LoadState): void;
  setTaskActionError(message: string | null): void;
  setTaskActionMessage(message: string | null): void;
}

interface OperatorWorkspaceCommandContext {
  readonly config: ForwardBridgeConfig;
  readonly route: ForwardRoute;
  readonly draft: OperatorWorkspaceDraft;
  readonly refresh: (nextWorkspaceId?: string | null) => Promise<void>;
  readonly feedback: OperatorWorkspaceCommandFeedback;
}

interface OperatorWorkspaceQuickStatusContext extends OperatorWorkspaceCommandContext {
  readonly status: string;
}

interface OperatorWorkspaceTaskContext extends OperatorWorkspaceCommandContext {
  readonly taskId: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createOperatorWorkspaceCommandService(gateway: OperatorWorkspaceCommandGateway) {
  return {
    async submit({ config, route, draft, refresh, feedback }: OperatorWorkspaceCommandContext) {
      if (!config.token.trim()) return;
      if (operatorWorkspaceNeedsArchiveRationale(draft.status, draft)) {
        feedback.setMutationState("error");
        feedback.setMutationError("Workspace archive rationale is required.");
        return;
      }
      const body = buildOperatorWorkspaceMutationBody(draft);
      try {
        feedback.setMutationState("loading");
        feedback.setMutationError(null);
        const result = route.screen === "workspace-detail" && route.workspaceId
          ? await gateway.updateWorkspace(config, route.workspaceId, body)
          : await gateway.createWorkspace(config, body);
        await refresh(result.workspace.workspace_id);
        feedback.setMutationState("ready");
      } catch (error) {
        feedback.setMutationState("error");
        feedback.setMutationError(toErrorMessage(error));
      }
    },

    async quickStatus({ config, route, draft, status, refresh, feedback }: OperatorWorkspaceQuickStatusContext) {
      if (!config.token.trim() || route.screen !== "workspace-detail" || !route.workspaceId) return;
      if (operatorWorkspaceNeedsArchiveRationale(status, draft)) {
        feedback.setMutationState("error");
        feedback.setMutationError("Workspace archive rationale is required.");
        return;
      }
      const body = buildOperatorWorkspaceMutationBody(draft, status);
      try {
        feedback.setMutationState("loading");
        feedback.setMutationError(null);
        const result = await gateway.updateWorkspace(config, route.workspaceId, body);
        await refresh(result.workspace.workspace_id);
        feedback.setMutationState("ready");
      } catch (error) {
        feedback.setMutationState("error");
        feedback.setMutationError(toErrorMessage(error));
      }
    },

    async detachTask({ config, route, taskId, refresh, feedback }: OperatorWorkspaceTaskContext) {
      if (!config.token.trim() || route.screen !== "workspace-detail" || !route.workspaceId) return;
      try {
        feedback.setTaskActionState("loading");
        feedback.setTaskActionError(null);
        feedback.setTaskActionMessage(null);
        await gateway.detachTaskWorkspace(config, taskId);
        await refresh(route.workspaceId);
        feedback.setTaskActionState("ready");
        feedback.setTaskActionMessage(`Detached ${taskId} from ${route.workspaceId}.`);
      } catch (error) {
        feedback.setTaskActionState("error");
        feedback.setTaskActionError(toErrorMessage(error));
      }
    },

    async archiveTask({ config, route, draft, taskId, refresh, feedback }: OperatorWorkspaceTaskContext) {
      if (!config.token.trim() || route.screen !== "workspace-detail" || !route.workspaceId) return;
      const rationale = draft.archiveNote.trim() || `Workspace archive blocker resolution for ${route.workspaceId}.`;
      try {
        feedback.setTaskActionState("loading");
        feedback.setTaskActionError(null);
        feedback.setTaskActionMessage(null);
        await gateway.archiveTask(config, taskId, { archive_note: rationale });
        await refresh(route.workspaceId);
        feedback.setTaskActionState("ready");
        feedback.setTaskActionMessage(`Archived linked task ${taskId}.`);
      } catch (error) {
        feedback.setTaskActionState("error");
        feedback.setTaskActionError(toErrorMessage(error));
      }
    },
  };
}

export const operatorWorkspaceCommandService = createOperatorWorkspaceCommandService({
  createWorkspace: forwardCreateOperatorWorkspace,
  updateWorkspace: forwardUpdateOperatorWorkspace,
  detachTaskWorkspace: forwardDetachOperatorTaskWorkspace,
  archiveTask: forwardArchiveOperatorTask,
});
