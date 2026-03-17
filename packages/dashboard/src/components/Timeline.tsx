import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useEventStore } from "../store/event-store.js";

const TYPE_COLORS: Record<string, string> = {
  task: "#3b82f6",
  agent: "#22c55e",
  handoff: "#f59e0b",
  decision: "#8b5cf6",
  approval: "#f97316",
  message: "#06b6d4",
  memory: "#ec4899",
  system: "#64748b",
  command: "#ef4444",
  mode: "#a855f7",
};

function getTypePrefix(type: string): string {
  return type.split(".")[0];
}

export function Timeline() {
  const { events } = useEventStore();

  const chartData = useMemo(() => {
    if (events.length === 0) return [];

    // Group events by minute
    const buckets = new Map<string, Record<string, number>>();

    for (const event of events) {
      const minute = event.ts.slice(0, 16); // YYYY-MM-DDTHH:MM
      const prefix = getTypePrefix(event.type);

      if (!buckets.has(minute)) {
        buckets.set(minute, {});
      }
      const bucket = buckets.get(minute)!;
      bucket[prefix] = (bucket[prefix] || 0) + 1;
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, counts]) => ({
        time: time.slice(11), // HH:MM
        ...counts,
      }));
  }, [events]);

  const activeTypes = useMemo(() => {
    const types = new Set<string>();
    for (const event of events) {
      types.add(getTypePrefix(event.type));
    }
    return [...types].sort();
  }, [events]);

  if (events.length === 0) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
        No events yet. Connect to a running Conitens instance to see the timeline.
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px", color: "#94a3b8" }}>
        Event Timeline ({events.length} events)
      </h2>
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
          <YAxis stroke="#64748b" fontSize={11} />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", fontSize: "12px" }}
            labelStyle={{ color: "#94a3b8" }}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          {activeTypes.map((prefix) => (
            <Area
              key={prefix}
              type="monotone"
              dataKey={prefix}
              stackId="1"
              stroke={TYPE_COLORS[prefix] || "#94a3b8"}
              fill={TYPE_COLORS[prefix] || "#94a3b8"}
              fillOpacity={0.3}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
