import React from "react";
import type { EventRecord } from "../store/event-store.js";
import { useEventStore } from "../store/event-store.js";
import { getEventFamily } from "../utils.js";

export function ApprovalGate({ events }: { events: EventRecord[] }) {
  const addEvent = useEventStore((s) => s.addEvent);

  const pendingApprovals = events.filter(
    (e) =>
      e.type === "approval.pending" ||
      e.type === "question.opened",
  );

  if (pendingApprovals.length === 0) return null;

  const handleApprove = (event: EventRecord) => {
    addEvent({
      event_id: `evt_approve_${Date.now()}`,
      type: "approval.granted",
      ts: new Date().toISOString(),
      actor: { kind: "user", id: "dashboard" },
      task_id: event.task_id,
      payload: { original_event: event.event_id },
    });
  };

  const handleDeny = (event: EventRecord) => {
    addEvent({
      event_id: `evt_deny_${Date.now()}`,
      type: "approval.denied",
      ts: new Date().toISOString(),
      actor: { kind: "user", id: "dashboard" },
      task_id: event.task_id,
      payload: { original_event: event.event_id },
    });
  };

  return (
    <section className="panel approval-gate" aria-live="polite">
      <div className="panel-body">
        <div className="section-head">
          <p className="panel-kicker">APPROVAL_GATE</p>
          <span className="signal-chip warning">
            {pendingApprovals.length} pending
          </span>
        </div>
        <div className="stack">
          {pendingApprovals.map((event) => (
            <div key={event.event_id} className="approval-row">
              <div className="approval-info">
                <span className={`event-pill ${getEventFamily(event.type)}`}>
                  {getEventFamily(event.type)}
                </span>
                <div>
                  <strong>{event.type}</strong>
                  <div className="muted">
                    {event.actor.id}
                    {event.task_id ? ` / ${event.task_id}` : ""}
                  </div>
                </div>
              </div>
              <div className="approval-actions">
                <button
                  className="approve-button"
                  type="button"
                  onClick={() => handleApprove(event)}
                  aria-label={`Approve ${event.type}${event.task_id ? " for " + event.task_id : ""}`}
                >
                  Approve
                </button>
                <button
                  className="deny-button"
                  type="button"
                  onClick={() => handleDeny(event)}
                  aria-label={`Deny ${event.type}${event.task_id ? " for " + event.task_id : ""}`}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
