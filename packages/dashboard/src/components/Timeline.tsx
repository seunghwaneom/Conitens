import React, { useMemo, useState } from "react";
import type { EventRecord } from "../store/event-store.js";
import { getEventFamily } from "../utils.js";

export function Timeline({ events }: { events: EventRecord[] }) {
  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("");

  const families = useMemo(() => {
    const set = new Set<string>();
    for (const event of events) set.add(getEventFamily(event.type));
    return Array.from(set).sort();
  }, [events]);

  const filtered = useMemo(() => {
    let result = events;
    if (familyFilter !== "all") {
      result = result.filter((e) => getEventFamily(e.type) === familyFilter);
    }
    if (actorFilter) {
      const q = actorFilter.toLowerCase();
      result = result.filter((e) => e.actor.id.toLowerCase().includes(q));
    }
    return [...result].slice(-30).reverse();
  }, [events, familyFilter, actorFilter]);

  const latestEvent = filtered[0];

  if (events.length === 0) {
    return (
      <div className="empty-state animated">
        No events recorded yet. Connect to a live Conitens bus to start streaming...
      </div>
    );
  }

  return (
    <div className="timeline-shell">
      <div className="timeline-summary">
        <div className="metric-card">
          <div className="metric-label">Total Events</div>
          <div className="metric-value">{events.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Filtered</div>
          <div className="metric-value">{filtered.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Families</div>
          <div className="metric-value">{families.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Latest Actor</div>
          <div className="metric-value metric-value-compact">
            {latestEvent?.actor.id ?? "-"}
          </div>
        </div>
      </div>

      <div className="timeline-filters">
        <div className="filter-group">
          <label className="status-card-label" htmlFor="family-filter">type</label>
          <select
            id="family-filter"
            className="filter-select"
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
          >
            <option value="all">all types</option>
            {families.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="status-card-label" htmlFor="actor-filter">actor</label>
          <input
            id="actor-filter"
            className="filter-input"
            type="text"
            placeholder="filter by actor..."
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="timeline-focus">
        <div>
          <p className="panel-kicker">LATEST_SIGNAL</p>
          <strong>{latestEvent?.type ?? "No event"}</strong>
          <div className="muted">
            {latestEvent
              ? `${latestEvent.actor.id}${latestEvent.task_id ? ` / ${latestEvent.task_id}` : ""}`
              : "Connect live data to inspect event flow"}
          </div>
        </div>
        <span className={`event-pill ${getEventFamily(latestEvent?.type ?? "system")}`}>
          {getEventFamily(latestEvent?.type ?? "system")}
        </span>
      </div>

      <div className="timeline-table">
        <div className="timeline-table-header">
          <div>Timestamp</div>
          <div>Event</div>
          <div>Actor</div>
          <div>Task</div>
        </div>
        {filtered.map((event, index) => (
          <div key={event.event_id} className={`timeline-row${index === 0 ? " latest" : ""}`}>
            <div>{event.ts.slice(11, 19)}</div>
            <div className="timeline-event-cell">
              <span className={`event-pill ${getEventFamily(event.type)}`}>
                {getEventFamily(event.type)}
              </span>
              <strong>{event.type}</strong>
            </div>
            <div>{event.actor.id}</div>
            <div className="timeline-task-cell">{event.task_id ?? "-"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
