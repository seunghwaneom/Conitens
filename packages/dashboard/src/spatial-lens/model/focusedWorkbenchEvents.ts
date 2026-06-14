import type { EventRecord } from "../../store/event-store.js";

export interface FocusedWorkbenchEdge {
  readonly id: string;
  readonly state: "flow" | "held";
}

export interface FocusedWorkbenchEventSummary {
  readonly latestEventLabel: string;
  readonly blockedAgeLabel: string;
  readonly edges: readonly FocusedWorkbenchEdge[];
}

export function deriveFocusedWorkbenchEventSummary({
  blockedTaskId,
  hasBlockedTask,
  events,
}: {
  readonly blockedTaskId: string;
  readonly hasBlockedTask: boolean;
  readonly events: readonly EventRecord[];
}): FocusedWorkbenchEventSummary {
  const latestEvent =
    events.length > 0
      ? events.reduce((latest, ev) => (ev.ts > latest.ts ? ev : latest))
      : null;
  const blockedTaskEvents = hasBlockedTask
    ? events.filter(
        (ev) => ev.task_id === blockedTaskId && isBlockedAgeStartEvent(ev),
      )
    : [];

  return {
    latestEventLabel: latestEvent
      ? `${latestEvent.ts.slice(11, 19)} ${latestEvent.actor.id} ${latestEvent.type}`
      : "",
    blockedAgeLabel: getBlockedAgeLabel({
      blockedTaskEvents,
      latestTs: latestEvent?.ts ?? null,
    }),
    edges: [
      { id: "plan-blocked", state: "flow" },
      { id: "blocked-validate", state: "held" },
      { id: "validate-approve", state: "held" },
    ],
  };
}

function getBlockedAgeLabel({
  blockedTaskEvents,
  latestTs,
}: {
  readonly blockedTaskEvents: readonly EventRecord[];
  readonly latestTs: string | null;
}): string {
  if (blockedTaskEvents.length === 0 || latestTs === null) return "";
  const earliest = blockedTaskEvents.reduce((e, ev) =>
    ev.ts < e.ts ? ev : e,
  );
  const latestMs = new Date(latestTs).getTime();
  const earliestMs = new Date(earliest.ts).getTime();
  if (!Number.isFinite(latestMs) || !Number.isFinite(earliestMs)) return "";
  const diffMs = latestMs - earliestMs;
  if (diffMs < 0) return "";
  return `blocked ${Math.floor(diffMs / 60000)}m`;
}

function isBlockedAgeStartEvent(event: EventRecord): boolean {
  if (event.type === "question.opened" || event.type === "approval.pending") {
    return true;
  }
  return event.type === "task.status_changed" && event.payload.to === "blocked";
}
