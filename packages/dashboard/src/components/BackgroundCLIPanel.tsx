import React, { useEffect, useState } from "react";

interface BGProcess {
  id: string;
  command: string;
  status: "running" | "stopped" | "error";
  uptime: string;
  pid: number | null;
}

interface BackgroundCLIPanelProps {
  apiBase: string;
}

const STATUS_COLORS: Record<string, string> = {
  running: "#3fb950",
  stopped: "#8b949e",
  error: "#f85149",
};

export function BackgroundCLIPanel({ apiBase }: BackgroundCLIPanelProps) {
  const [processes, setProcesses] = useState<BGProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [newCmd, setNewCmd] = useState<string>("");
  const [starting, setStarting] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, string[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({});

  function fetchProcesses() {
    setLoading(true);
    fetch(`${apiBase}/api/bg/ps`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        setProcesses(data.processes ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchProcesses();
  }, [apiBase]);

  function handleStart() {
    if (!newCmd.trim()) return;
    setStarting(true);
    fetch(`${apiBase}/api/bg/up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: newCmd.trim() }),
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(() => {
        setNewCmd("");
        setStarting(false);
        fetchProcesses();
      })
      .catch(() => setStarting(false));
  }

  function handleStop(id: string) {
    fetch(`${apiBase}/api/bg/stop/${id}`, { method: "POST" })
      .then(() => fetchProcesses())
      .catch(() => {});
  }

  function handleToggleLogs(id: string) {
    if (expandedLogs[id] !== undefined) {
      setExpandedLogs((prev) => { const next = { ...prev }; delete next[id]; return next; });
      return;
    }
    setLoadingLogs((prev) => ({ ...prev, [id]: true }));
    fetch(`${apiBase}/api/bg/logs/${id}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        setExpandedLogs((prev) => ({ ...prev, [id]: data.lines ?? [] }));
        setLoadingLogs((prev) => { const next = { ...prev }; delete next[id]; return next; });
      })
      .catch(() => {
        setExpandedLogs((prev) => ({ ...prev, [id]: ["(failed to load logs)"] }));
        setLoadingLogs((prev) => { const next = { ...prev }; delete next[id]; return next; });
      });
  }

  const filtered = filter
    ? processes.filter(
        (p) =>
          p.id.includes(filter) ||
          p.command.includes(filter) ||
          p.status.includes(filter),
      )
    : processes;

  if (loading) return <div style={{ padding: 24, color: "#8b949e" }}>Loading processes...</div>;
  if (error) return <div style={{ padding: 24, color: "#f85149" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 20, color: "#e6edf3" }}>
        Background CLI ({processes.length})
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Command to start..."
          value={newCmd}
          onChange={(e) => setNewCmd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }}
          style={{
            flex: 1,
            maxWidth: 360,
            padding: "8px 12px",
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#e6edf3",
            fontSize: 14,
          }}
        />
        <button
          onClick={handleStart}
          disabled={starting || !newCmd.trim()}
          style={{
            padding: "8px 16px",
            background: starting ? "#21262d" : "#238636",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#e6edf3",
            fontSize: 14,
            cursor: starting ? "not-allowed" : "pointer",
          }}
        >
          {starting ? "Starting..." : "Start"}
        </button>
        <button
          onClick={fetchProcesses}
          style={{
            padding: "8px 12px",
            background: "#21262d",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#8b949e",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      <input
        type="text"
        placeholder="Filter by id, command, status..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          width: "100%",
          maxWidth: 400,
          padding: "8px 12px",
          marginBottom: 16,
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 6,
          color: "#e6edf3",
          fontSize: 14,
        }}
      />

      {filtered.length === 0 ? (
        <div style={{ color: "#8b949e", padding: 16 }}>No processes found</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((p) => (
            <div
              key={p.id}
              style={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: STATUS_COLORS[p.status] ?? "#8b949e",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#e6edf3" }}>
                    {p.command}
                  </div>
                  <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>
                    {p.id}
                    {p.pid != null ? ` · pid ${p.pid}` : ""}
                    {p.uptime ? ` · ${p.uptime}` : ""}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: `${STATUS_COLORS[p.status] ?? "#8b949e"}22`,
                    color: STATUS_COLORS[p.status] ?? "#8b949e",
                    flexShrink: 0,
                    textTransform: "uppercase",
                  }}
                >
                  {p.status}
                </span>
                <button
                  onClick={() => handleToggleLogs(p.id)}
                  disabled={loadingLogs[p.id]}
                  style={{
                    padding: "4px 10px",
                    background: "#21262d",
                    border: "1px solid #30363d",
                    borderRadius: 5,
                    color: "#8b949e",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {loadingLogs[p.id] ? "..." : expandedLogs[p.id] !== undefined ? "Hide" : "Logs"}
                </button>
                {p.status === "running" && (
                  <button
                    onClick={() => handleStop(p.id)}
                    style={{
                      padding: "4px 10px",
                      background: "#21262d",
                      border: "1px solid #f8514944",
                      borderRadius: 5,
                      color: "#f85149",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Stop
                  </button>
                )}
              </div>
              {expandedLogs[p.id] !== undefined && (
                <div
                  style={{
                    borderTop: "1px solid #30363d",
                    background: "#0d1117",
                    padding: "10px 16px",
                    fontFamily: "monospace",
                    fontSize: 12,
                    color: "#8b949e",
                    maxHeight: 200,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {expandedLogs[p.id].length === 0
                    ? "(no output)"
                    : expandedLogs[p.id].join("\n")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
