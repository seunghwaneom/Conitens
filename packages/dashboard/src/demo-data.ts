import type { AgentState, EventRecord, TaskState } from "./store/event-store.js";

export const demoAgents: AgentState[] = [
  { agentId: "architect", status: "running" },
  { agentId: "sentinel", status: "running" },
  { agentId: "worker-1", status: "idle" },
  { agentId: "owner", status: "idle" },
];

export const demoTasks: TaskState[] = [
  { taskId: "wf_apply", state: "active", assignee: "architect" },
  { taskId: "q_184_owner_gate", state: "blocked", assignee: "owner" },
  { taskId: "verify_append", state: "review", assignee: "sentinel" },
  { taskId: "office_snapshot", state: "planned", assignee: "worker-1" },
  { taskId: "replay_bundle", state: "assigned", assignee: "worker-1" },
  { taskId: "audit_packet", state: "done", assignee: "sentinel" },
];

export const demoEvents: EventRecord[] = [
  {
    event_id: "evt-001",
    type: "workflow.started",
    ts: "2026-03-21T08:02:11.000Z",
    actor: { kind: "agent", id: "architect" },
    task_id: "wf_apply",
    payload: { workflow: "wf_apply" },
  },
  {
    event_id: "evt-002",
    type: "question.opened",
    ts: "2026-03-21T08:03:24.000Z",
    actor: { kind: "agent", id: "architect" },
    task_id: "q_184_owner_gate",
    payload: { gate: "owner" },
  },
  {
    event_id: "evt-003",
    type: "handoff.sent",
    ts: "2026-03-21T08:05:02.000Z",
    actor: { kind: "agent", id: "architect" },
    task_id: "verify_append",
    payload: { target: "sentinel" },
  },
  {
    event_id: "evt-004",
    type: "agent.spawned",
    ts: "2026-03-21T08:06:15.000Z",
    actor: { kind: "agent", id: "worker-1" },
    payload: { provider: "codex" },
  },
  {
    event_id: "evt-005",
    type: "task.status_changed",
    ts: "2026-03-21T08:08:44.000Z",
    actor: { kind: "agent", id: "sentinel" },
    task_id: "verify_append",
    payload: { to: "review" },
  },
  {
    event_id: "evt-006",
    type: "approval.pending",
    ts: "2026-03-21T08:10:03.000Z",
    actor: { kind: "agent", id: "owner" },
    task_id: "q_184_owner_gate",
    payload: { owner: "ops.team" },
  },
  {
    event_id: "evt-007",
    type: "event.appended",
    ts: "2026-03-21T08:12:38.000Z",
    actor: { kind: "system", id: "ops-log" },
    task_id: "office_snapshot",
    payload: { stream: "ops" },
  },
  {
    event_id: "evt-008",
    type: "artifact.written",
    ts: "2026-03-21T08:14:52.000Z",
    actor: { kind: "agent", id: "worker-1" },
    task_id: "replay_bundle",
    payload: { path: ".notes/runs/wf_apply.json" },
  },
];
