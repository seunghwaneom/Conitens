import type { TaskState } from "../../store/event-store.js";

export type FocusedNextActionKind =
  | "owner-approval"
  | "sentinel-review"
  | "monitor";

export type FocusedNextActionCtaLabel =
  | "Open approvals"
  | "Open review queue"
  | "Monitor handoff";

export type FocusedNextActionHref =
  | "#/approvals"
  | "#/tasks"
  | "#/office-preview";

export interface FocusedNextAction {
  readonly kind: FocusedNextActionKind;
  readonly label: string;
  readonly ctaLabel: FocusedNextActionCtaLabel;
  readonly href: FocusedNextActionHref;
  readonly detail: string;
}

export function deriveFocusedNextAction({
  blockedTask,
  reviewTask,
  blockedTaskId,
  ownerId,
  targetId,
}: {
  readonly blockedTask: TaskState | undefined;
  readonly reviewTask: TaskState | undefined;
  readonly blockedTaskId: string;
  readonly ownerId: string;
  readonly targetId: string;
}): FocusedNextAction {
  if (blockedTask) {
    return {
      kind: "owner-approval",
      label: "Owner approval required",
      ctaLabel: "Open approvals",
      href: "#/approvals",
      detail: `${blockedTaskId} is waiting on ${ownerId}`,
    };
  }
  if (reviewTask) {
    return {
      kind: "sentinel-review",
      label: "Sentinel review required",
      ctaLabel: "Open review queue",
      href: "#/tasks",
      detail: `${reviewTask.taskId} is ready for ${targetId} review`,
    };
  }
  return {
    kind: "monitor",
    label: "No blocked owner gate",
    ctaLabel: "Monitor handoff",
    href: "#/office-preview",
    detail: "Owner gate is clear.",
  };
}
