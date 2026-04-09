import React, { useMemo } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { AppRouter } from "./screens/AppRouter.js";
import { useUiStore } from "./store/ui-store.js";
import { useDashboardStore } from "./store/dashboard-store.js";
import { buildForwardRoute } from "./forward-route.js";

/* ────────────────────────────────────────────────────────────────────────
   Shell copy — derived from current route + demo state.
   Stays here because it's part of the global header, not any single screen.
   ──────────────────────────────────────────────────────────────────────── */

const SHELL_COPY: Record<string, { eyebrow: string; subtitle: string } | undefined> = {
  "office-preview": {
    eyebrow: "Spatial lens",
    subtitle: "Room topology, crew focus, and handoff rhythm in one shared operator shell.",
  },
  agents: {
    eyebrow: "Agent fleet",
    subtitle: "Lifecycle, memory growth, proposal flow, and relationship topology for the active fleet.",
  },
  "agent-detail": {
    eyebrow: "Agent fleet",
    subtitle: "Lifecycle, memory growth, proposal flow, and relationship topology for the active fleet.",
  },
  threads: {
    eyebrow: "Communication ledger",
    subtitle: "Thread browser for agent-to-agent and user-to-agent communication with full message history.",
  },
  "thread-detail": {
    eyebrow: "Communication ledger",
    subtitle: "Thread browser for agent-to-agent and user-to-agent communication with full message history.",
  },
  approvals: {
    eyebrow: "Approval center",
    subtitle: "Pending and resolved approval requests across all active runs and workspaces.",
  },
  "bg-cli": {
    eyebrow: "Background CLI",
    subtitle: "Monitor and control background CLI processes — subprocess lifecycle, logs, and runtime health.",
  },
  tokens: {
    eyebrow: "Token budget",
    subtitle: "L0/L1/L2 compression tiers, per-agent token usage, and budget utilization at a glance.",
  },
  "weekly-report": {
    eyebrow: "Weekly report",
    subtitle: "Failure mining, improvement proposals, and agent performance for the current reporting period.",
  },
  "run-detail": {
    eyebrow: "Run detail",
    subtitle: "Replay, approvals, room state, and runtime documents in a single operational surface.",
  },
  inbox: {
    eyebrow: "Operator inbox",
    subtitle: undefined as unknown as string,
  },
};

/* Demo-aware subtitle overrides */
function resolveSubtitle(screen: string, isDemo: boolean): string {
  if (screen === "tasks" || screen === "task-detail") {
    return isDemo
      ? "Use the demo shell or connect a live bridge to inspect canonical operator tasks."
      : "Operator tasks are the first owned API slice. Use them to inspect durable work objects without starting from raw runs.";
  }
  if (screen === "workspaces" || screen === "workspace-detail") {
    return isDemo
      ? "Use the demo shell or connect a live bridge to inspect canonical operator workspaces."
      : "Operator workspaces are the next owned object layer. Use them to turn workspace refs into durable records.";
  }
  if (screen === "runs") {
    return isDemo
      ? "Use the demo shell or connect a live bridge to inspect runs, approvals, and room timelines."
      : "Execution traces remain evidence-first. Use overview for posture, then drill into run detail when needed.";
  }
  if (screen === "inbox") {
    return isDemo
      ? "Use the demo shell or connect a live bridge to inspect actionable operator attention items."
      : "Operator inbox stays projection-first. Clear approvals, validator failures, blocked handoffs, and stale runs before drilling into traces.";
  }
  const entry = SHELL_COPY[screen];
  if (entry?.subtitle) return entry.subtitle;
  return isDemo
    ? "Use the demo shell or connect a live bridge to inspect the current operator posture and execution traces."
    : "Operator summary stays projection-first. Use overview for posture and runs for evidence-rich drill-down.";
}

function resolveEyebrow(screen: string): string {
  if (screen === "tasks" || screen === "task-detail") return "Operator tasks";
  if (screen === "workspaces" || screen === "workspace-detail") return "Operator workspaces";
  if (screen === "runs") return "Execution traces";
  const entry = SHELL_COPY[screen];
  return entry?.eyebrow ?? "Operator overview";
}

/* ────────────────────────────────────────────────────────────────────────
   Nav items — order matches the original chip row.
   ──────────────────────────────────────────────────────────────────────── */

interface NavItem {
  href: string;
  label: string;
  screens: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "#/overview", label: "Overview", screens: ["overview"] },
  { href: "#/inbox", label: "Inbox", screens: ["inbox"] },
  { href: "#/tasks", label: "Tasks", screens: ["tasks", "task-detail"] },
  { href: "#/workspaces", label: "Workspaces", screens: ["workspaces", "workspace-detail"] },
  { href: "#/runs", label: "Runs", screens: ["runs", "run-detail"] },
  { href: "#/office-preview", label: "Spatial Lens", screens: ["office-preview"] },
  { href: "#/agents", label: "Agents", screens: ["agents", "agent-detail"] },
  { href: "#/threads", label: "Threads", screens: ["threads", "thread-detail"] },
  { href: "#/approvals", label: "Approvals", screens: ["approvals"] },
  { href: "#/bg-cli", label: "BG CLI", screens: ["bg-cli"] },
  { href: "#/tokens", label: "Tokens", screens: ["tokens"] },
  { href: "#/weekly-report", label: "Weekly", screens: ["weekly-report"] },
];

/* ────────────────────────────────────────────────────────────────────────
   App — thin shell.  State lives in Zustand stores + per-screen components.
   ──────────────────────────────────────────────────────────────────────── */

export function App() {
  const route = useUiStore((s) => s.route);
  const config = useDashboardStore((s) => s.config);
  const isOfficePreview = route.screen === "office-preview";
  const isDemo = !config.token.trim() && !isOfficePreview;

  const shellCopy = useMemo(
    () => ({
      eyebrow: resolveEyebrow(route.screen),
      title: "Conitens Control Plane",
      subtitle: resolveSubtitle(route.screen, isDemo),
    }),
    [route.screen, isDemo],
  );

  return (
    <div className={`forward-shell${isOfficePreview ? " forward-shell-preview" : ""}`}>
      <header className="forward-header">
        <div>
          <p className="forward-eyebrow">{shellCopy.eyebrow}</p>
          <h1>{shellCopy.title}</h1>
          <p className="forward-subtitle">{shellCopy.subtitle}</p>
        </div>
        <div className="forward-chip-row">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              className={`forward-chip forward-chip-link${item.screens.includes(route.screen) ? " active" : ""}`}
              href={item.href}
            >
              {item.label}
            </a>
          ))}
          {isOfficePreview ? (
            <span className="forward-chip">Preview data</span>
          ) : (
            <>
              <span className="forward-chip">API {config.apiRoot}</span>
              <span className="forward-chip">
                {config.token ? "Token loaded" : "Token required"}
              </span>
            </>
          )}
        </div>
      </header>

      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
    </div>
  );
}
