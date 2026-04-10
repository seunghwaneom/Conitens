import { useEffect, useState } from "react";
import { Button, LoadingState, ErrorDisplay, EmptyState } from "../ds/index.js";
import { createForwardAuthHeaders } from "../forward-bridge.js";
import styles from "./BackgroundCLIPanel.module.css";

interface BGProcess {
  id: string;
  command: string;
  status: "running" | "stopped" | "error";
  uptime: string;
  pid: number | null;
}

interface BackgroundCLIPanelProps {
  apiBase: string;
  token: string;
}

const STATUS_DOT_CLASS: Record<string, string> = {
  running: styles.statusRunning,
  stopped: styles.statusStopped,
  error: styles.statusError,
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  running: styles.statusBadgeRunning,
  stopped: styles.statusBadgeStopped,
  error: styles.statusBadgeError,
};

export function BackgroundCLIPanel({ apiBase, token }: BackgroundCLIPanelProps) {
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
    fetch(`${apiBase}/bg/ps`, { headers: createForwardAuthHeaders(token) })
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
  }, [apiBase, token]);

  function handleStart() {
    if (!newCmd.trim()) return;
    setStarting(true);
    fetch(`${apiBase}/bg/up`, {
      method: "POST",
      headers: createForwardAuthHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ command: newCmd.trim() }),
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(() => {
        setNewCmd("");
        setStarting(false);
        fetchProcesses();
      })
      .catch((err) => { setError(err instanceof Error ? err.message : "Failed to start"); setStarting(false); });
  }

  function handleStop(id: string) {
    fetch(`${apiBase}/bg/stop/${id}`, { method: "POST", headers: createForwardAuthHeaders(token) })
      .then(() => fetchProcesses())
      .catch((err) => { setError(err instanceof Error ? err.message : "Failed to stop process"); });
  }

  function handleToggleLogs(id: string) {
    if (expandedLogs[id] !== undefined) {
      setExpandedLogs((prev) => { const next = { ...prev }; delete next[id]; return next; });
      return;
    }
    setLoadingLogs((prev) => ({ ...prev, [id]: true }));
    fetch(`${apiBase}/bg/logs/${id}`, { headers: createForwardAuthHeaders(token) })
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

  if (loading) return <LoadingState message="Loading processes…" />;
  if (error) return <ErrorDisplay message={error} />;

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>
        Background CLI ({processes.length})
      </h2>

      <div className={styles.toolbar}>
        <input
          type="text"
          placeholder="Command to start…"
          value={newCmd}
          onChange={(e) => setNewCmd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }}
          className={styles.input}
        />
        <Button
          variant="primary"
          onClick={handleStart}
          disabled={starting || !newCmd.trim()}
        >
          {starting ? "Starting…" : "Start"}
        </Button>
        <Button
          variant="secondary"
          onClick={fetchProcesses}
        >
          Refresh
        </Button>
      </div>

      <input
        type="text"
        placeholder="Filter by ID, command, or status…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className={styles.filterInput}
      />

      {filtered.length === 0 ? (
        <EmptyState message="No processes found" />
      ) : (
        <div className={styles.processList}>
          {filtered.map((p) => (
            <div key={p.id} className={styles.processCard}>
              <div className={styles.processRow}>
                <span
                  className={`${styles.statusDot} ${STATUS_DOT_CLASS[p.status] ?? styles.statusStopped}`}
                />
                <div className={styles.processInfo}>
                  <div className={styles.processCmd}>
                    {p.command}
                  </div>
                  <div className={styles.processMeta}>
                    {p.id}
                    {p.pid != null ? ` · pid ${p.pid}` : ""}
                    {p.uptime ? ` · ${p.uptime}` : ""}
                  </div>
                </div>
                <span
                  className={`${styles.statusBadge} ${STATUS_BADGE_CLASS[p.status] ?? styles.statusBadgeStopped}`}
                >
                  {p.status}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => handleToggleLogs(p.id)}
                  disabled={loadingLogs[p.id]}
                >
                  {loadingLogs[p.id] ? "…" : expandedLogs[p.id] !== undefined ? "Hide" : "Logs"}
                </Button>
                {p.status === "running" && (
                  <Button
                    variant="secondary"
                    className={styles.stopButton}
                    onClick={() => handleStop(p.id)}
                  >
                    Stop
                  </Button>
                )}
              </div>
              {expandedLogs[p.id] !== undefined && (
                <div className={styles.logPanel}>
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
