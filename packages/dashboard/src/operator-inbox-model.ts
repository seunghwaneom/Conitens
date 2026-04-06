import type { ForwardOperatorInboxItem, ForwardOperatorInboxResponse } from "./forward-bridge.js";
import { buildForwardRoute } from "./forward-route.ts";

export interface OperatorInboxItemViewModel {
  id: string;
  tone: "info" | "warning" | "danger";
  title: string;
  detail: string;
  meta: string;
  actionLabel: string;
  targetHash: string;
}

function toTargetHash(item: ForwardOperatorInboxItem): string {
  if (item.run_id) {
    return buildForwardRoute({ screen: "run-detail", runId: item.run_id, taskId: null, workspaceId: null, threadId: null, agentId: null });
  }
  return buildForwardRoute({ screen: "runs", runId: null, taskId: null, workspaceId: null, threadId: null, agentId: null });
}

function toMeta(item: ForwardOperatorInboxItem): string {
  const refs = [item.run_id, item.iteration_id, item.room_id].filter(Boolean);
  return refs.length > 0 ? refs.join(" | ") : item.kind;
}

export function toOperatorInboxViewModel(
  response: ForwardOperatorInboxResponse,
): OperatorInboxItemViewModel[] {
  return response.items.map((item) => ({
    id: item.id,
    tone: item.severity,
    title: item.title,
    detail: item.summary,
    meta: toMeta(item),
    actionLabel: item.action_label,
    targetHash: toTargetHash(item),
  }));
}
