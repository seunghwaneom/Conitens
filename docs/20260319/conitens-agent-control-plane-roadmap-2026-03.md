# Conitens Agent Control Plane Roadmap (2026-03)

Status: Draft  
Date: 2026-03-19  
Scope: agents, skills map, workflows, handoffs, orchestration, approval/verify gates, MCP/A2A compatibility

## Why This Document Exists

Conitens already has strong operational primitives, but they are split across two narratives:

- the current Python operations layer centered on `scripts/ensemble.py` and `.notes/`
- the earlier `.conitens` event-sourced TypeScript stack described in `README.md` and `packages/*`

The next step is not "add more agent features first." It is to unify the control plane, then expand agents, skills, workflows, and orchestration on top of one clear source of truth.

This document supersedes `docs/ROADMAP-v2.1.md` for agent-orchestration planning because it is:

- aligned to the current v4.2.0 repository shape
- based on official or primary sources as of 2026-03-19
- structured around additive implementation in the existing Core

## Executive Summary

Recommendation:

1. Freeze the control-plane architecture with an ADR before adding new orchestration surfaces.
2. Introduce machine-readable agent and skill manifests without replacing the current markdown compatibility layer.
3. Upgrade the workflow engine from linear `cli` steps to resumable graph execution with approval and verify nodes.
4. Add typed handoffs, artifact manifests, and trace correlation before enabling broader remote orchestration.
5. Expand MCP and A2A only through the existing local approval and verify boundaries.

The repository already contains enough building blocks to do this without a rewrite.

## Current State: What Conitens Already Has

### 1. A real operations core already exists

- `CONITENS.md` defines Conitens as an operations layer coordinating external runtimes through files, approvals, verification, meetings, replayable events, and reports.
- `scripts/ensemble.py` remains the Core entrypoint and already owns task lifecycle, lock handling, question/approval flow, verify, and close.
- The project guide explicitly requires additive extension modules instead of replacing the Core.

Relevant files:

- `CONITENS.md`
- `scripts/ensemble.py`
- `.agent/rules/ensemble-protocol.md`

### 2. Safety gates are already first-class

Existing control points:

- agent registration guard: `scripts/ensemble.py:327-365`
- question creation and queueing: `scripts/ensemble.py:1227-1285`
- owner-only approval path: `scripts/ensemble.py:1497-1552`
- verify command: `scripts/ensemble.py:2610-2888`
- close command: `scripts/ensemble.py:2902+`

This is a strong base. Future orchestration should call into these gates, not route around them.

### 3. Workflow contracts already exist, but the engine is still narrow

Current workflow contracts:

- `.agent/workflows/verify-close.md`
- `.agent/workflows/research-build-review.md`
- `.agent/workflows/incident-triage.md`

Current engine constraints in `scripts/ensemble_workflow.py`:

- only markdown frontmatter contracts
- only `kind: cli`
- only simple ordered step execution
- run records saved to `.notes/WORKFLOWS/`
- warnings for unknown fields instead of hard failure

That is a good compatibility baseline, but not yet a modern orchestration engine.

### 4. Append-only event and meeting surfaces already exist

- event append and replay summary: `scripts/ensemble_events.py`
- meeting transcript and derived summary split: `scripts/ensemble_meeting.py`
- office rollup of tasks, approvals, verify, workflow runs, meetings, and blocked items: `scripts/ensemble_office.py`

This is already close to a traceable "artifact plane"; it just needs stronger typing and correlation.

### 5. MCP exists, but only as a safe read-only slice

Current MCP server:

- `scripts/ensemble_mcp_server.py`
- tools today: `task.list`, `task.get`, `locks.list`, `questions.list`, `context.get`, `meetings.list`
- explicit `write: false` capability

This matches current safety goals, but it underuses the modern MCP surface.

### 6. The repo also contains reusable TypeScript orchestration pieces

The older package layer still matters:

- worktree manager: `packages/core/src/worktree/worktree-manager.ts`
- trace logger: `packages/core/src/traces/trace-logger.ts`
- A2A client scaffold: `packages/core/src/a2a/a2a-client.ts`
- plugin manager: `packages/core/src/plugins/plugin-manager.ts`
- agent spawner: `packages/core/src/agent-spawner/agent-spawner.ts`
- MCP server scaffold: `packages/core/src/mcp/mcp-server.ts`

These modules should be reused or projected forward where practical, not duplicated blindly in Python.

### 7. The main architectural problem is narrative drift

Current drift:

- `README.md` still frames Conitens mainly as a v2 `.conitens` event-sourced monorepo runtime.
- `CONITENS.md` frames current Conitens as a v4 operations layer centered on `.notes/`, `.agent/`, `.agents/skills/`, and `scripts/ensemble.py`.

Until this is resolved, new orchestration features will keep landing on ambiguous ground.

## Official-Source Findings (As Of 2026-03-19)

### OpenAI

What matters for Conitens:

- OpenAI's practical agent guidance recommends maximizing a single agent first, then splitting into multi-agent systems only when prompt/tool separation or coordination overhead is justified.
- OpenAI recommends standardized tool definitions and explicitly treats agents themselves as orchestration tools for other agents.
- The OpenAI Agents SDK now presents manager-style orchestration, handoffs, hooks, guardrails, results/state handling, MCP server support, and tracing as first-class surfaces.
- The Codex app formalizes three patterns that map directly to Conitens needs: multi-agent parallel work, repository-scoped skills, and scheduled automations reviewed through a queue.

Implication for Conitens:

- keep Core gating centralized
- add agent manifests and handoff semantics before adding arbitrary autonomous spawning
- treat skills as reusable instruction/resource/script bundles, not just prose files

### Model Context Protocol (MCP)

The current MCP spec is broader than "tool calling only." It standardizes:

- tools
- resources
- prompts
- lifecycle and client/server features

Implication for Conitens:

- the next MCP step should be resources and prompts before write tools
- skills, workflow explanations, office reports, current context, and approval queues all fit naturally as MCP resources/prompts

### A2A Protocol

The A2A spec now gives Conitens a useful target shape:

- `taskId` and `contextId` for long-running work
- `input-required` task states for mid-run user input
- artifacts as structured outputs
- polling, streaming, and push update modes

Implication for Conitens:

- Conitens can map `.notes/WORKFLOWS/`, question gates, event streams, and office artifacts into A2A-native concepts without abandoning its file-first model

### Anthropic / Claude Code

Claude Code's official direction reinforces:

- subagents as specialized execution surfaces
- hooks around workflow events
- slash-command and markdown-native team conventions

Implication for Conitens:

- `.agent/` and `.agents/skills/` are already conceptually aligned
- Conitens should add machine-readable manifests under the existing markdown layer instead of replacing it

### LangGraph

LangGraph's official focus is durable execution plus human-in-the-loop interrupts and approvals.

Implication for Conitens:

- resumable interrupt nodes should become a native workflow concept
- the existing question/approval queue is the right place to anchor that behavior

### AutoGen

AutoGen's official handoff pattern is explicitly event-driven and topic-oriented.

Implication for Conitens:

- typed handoff events plus routable inbox/ack/result state are more important than chat-style narrative summaries alone

### CrewAI

CrewAI separates:

- crews: role-based multi-agent collaboration
- flows: deterministic process structure
- human input and observability as explicit execution features

Implication for Conitens:

- keep agent-team semantics and workflow-graph semantics separate
- do not overload "workflow" to mean both a team and a process

## Strategic Direction

Conitens should evolve as:

> a file-native, verify-gated, replayable control plane that can supervise heterogeneous agent runtimes through typed manifests, resumable workflows, and protocol adapters

Conitens should not evolve into:

- a framework-specific agent runtime replacement
- a second hidden orchestration engine that bypasses Core policy
- a write-enabled remote control plane without local approval semantics

## Architecture Principles

1. `scripts/ensemble.py` remains the Core.
2. New capability lands in additive modules.
3. `.notes/` remains canonical for current v4 operational truth unless an ADR replaces it.
4. Every write or execute path goes through one gate engine.
5. Every long-running workflow produces resumable state plus artifacts.
6. Every handoff is machine-readable.
7. MCP and A2A are adapters over the same control plane, not parallel truth systems.
8. Human-readable summaries remain derived outputs, never the primary state.

## Recommended Roadmap

## Phase 0: Control-Plane Unification

Goal: remove ambiguity about what Conitens is before extending it.

Deliverables:

- new ADR choosing canonical runtime truth and compatibility boundaries
- `README.md` updated to reflect current v4 reality
- a compatibility note describing how `.notes/` and `.conitens` relate
- a decision on whether `packages/*` are active runtime components, shared libraries, or legacy reference implementations

Suggested files:

- `docs/adr-0001-control-plane.md`
- `docs/control-plane-compatibility.md`
- `README.md`
- `CONITENS.md`

Acceptance criteria:

- one clear control-plane hierarchy is documented
- no top-level doc contradicts that hierarchy
- future roadmap items name one canonical state surface

## Phase 1: Agent Registry vNext

Goal: introduce typed agent definitions for routing, permissions, and handoffs.

Why now:

- latest agent platforms all rely on explicit agent identity and capability surfaces
- Conitens currently has runtime conventions but not a machine-readable agent registry in `.agent/`

Add:

- `.agent/agents/*.yaml` or `.agent/agents/*.md` with frontmatter
- registry schema with:
  - `agent_id`
  - `role`
  - `runtime` (`codex`, `claude`, `gemini`, `local`, `remote`)
  - `model_policy`
  - `capabilities`
  - `tool_scopes`
  - `can_delegate_to`
  - `requires_worktree`
  - `approval_class`
  - `verify_role`

Implementation surfaces:

- new `scripts/ensemble_registry.py`
- extend `scripts/ensemble_contracts.py` for registry parsing/validation
- add `ensemble agent list|show|validate`

Reuse opportunities:

- `packages/core/src/agent-spawner/agent-spawner.ts`
- `packages/core/src/worktree/worktree-manager.ts`

Acceptance criteria:

- agents are discoverable and validated from `.agent/agents/`
- workflow steps can reference agents by capability, not only by raw command text
- registry can project runtime-specific launch hints without changing Core semantics

## Phase 2: Skill Map And Tool Registry

Goal: turn `.agents/skills/` into a real skill map while preserving `SKILL.md`.

Current issue:

- skills are human-readable but not strongly queryable
- MCP and workflow layers cannot reason about skill triggers, inputs, outputs, or approval class

Add:

- `skill.yaml` beside each `SKILL.md`
- shared skill schema:
  - `skill_id`
  - `summary`
  - `triggers`
  - `compatible_runtimes`
  - `inputs`
  - `outputs`
  - `tools`
  - `hooks`
  - `requires_approval`
  - `artifacts_emitted`

Implementation surfaces:

- new `scripts/ensemble_skills.py`
- optional `.agent/tools/registry.yaml`
- generated `docs/skills-map.md`

Why this matters:

- aligns with OpenAI skill bundles and Claude Code markdown-native skill usage
- lets workflows request capabilities, not hard-coded prompts
- enables MCP resources/prompts for skill discovery

Acceptance criteria:

- every skill is both human-readable and machine-readable
- skills can be filtered by runtime, risk, trigger, and output artifact
- office report can include active skills referenced by runs

## Phase 3: Workflow Graph Engine

Goal: upgrade from linear `cli` step lists to resumable graph execution.

Current gap:

- `scripts/ensemble_workflow.py` supports only sequential `cli` steps
- no branching, fan-out, fan-in, loop, approval node, or resume node

Extend workflow schema with step kinds such as:

- `cli`
- `agent`
- `approval`
- `verify`
- `meeting`
- `emit_event`
- `parallel`
- `join`
- `loop`
- `branch`

Execution model:

- workflow definition remains markdown contract plus frontmatter
- engine compiles steps to a run graph
- each run stores:
  - current node
  - pending interrupts
  - handoff edges
  - emitted artifacts
  - trace correlation ids

Implementation surfaces:

- extend `scripts/ensemble_workflow.py`
- add `scripts/ensemble_runtime.py`
- add `.notes/WORKFLOWS/<run>.json` schema v2

Acceptance criteria:

- workflow can pause on approval and resume without losing state
- workflow can fan out to multiple agent/cli nodes and join results
- workflow failures remain replayable and auditable

## Phase 4: Typed Handoffs And Gate Engine

Goal: make delegation explicit and policy-aware.

Add typed handoff states:

- `handoff.requested`
- `handoff.accepted`
- `handoff.started`
- `handoff.blocked`
- `handoff.completed`
- `handoff.rejected`

Gate engine responsibilities:

- unify question queue, owner approval, and verify-before-close
- attach risk class and subject metadata to each gated action
- support interrupt/resume behavior for workflows and remote requests

Implementation surfaces:

- new `scripts/ensemble_gates.py`
- extend `scripts/ensemble.py` question/approval path through shared helpers
- extend `scripts/ensemble_events.py` event types

Why this matters:

- matches modern handoff/interrupt patterns from OpenAI, AutoGen, LangGraph, and A2A
- keeps Conitens' strongest differentiation: safe, replayable human oversight

Acceptance criteria:

- every handoff is persisted as structured state and events
- every approval-worthy action produces a resumable gate record
- verify remains non-bypassable for close-worthy code work

## Phase 5: Trace And Artifact Plane

Goal: make long-running multi-agent work observable and replayable.

Current strengths to reuse:

- append-only events in `scripts/ensemble_events.py`
- run manifests in `scripts/ensemble_manifest.py`
- office reporting in `scripts/ensemble_office.py`
- trace logger in `packages/core/src/traces/trace-logger.ts`

Add:

- `.notes/TRACES/` or `.notes/traces/` canonical convention
- `.notes/ARTIFACTS/manifest.jsonl`
- correlation ids across workflow run, task, meeting, approval, and artifact
- artifact types such as:
  - report
  - patch
  - verification_result
  - meeting_summary
  - office_snapshot
  - external_link

Implementation surfaces:

- new `scripts/ensemble_traces.py`
- new `scripts/ensemble_artifacts.py`
- extend `scripts/ensemble_office.py`

Acceptance criteria:

- one run can be traced end-to-end across workflow, handoffs, gates, and outputs
- office report can answer "what is blocked and why" with run-aware context
- replay and postmortem artifacts do not depend on terminal logs

## Phase 6: MCP Expansion

Goal: move from read-only tools to a fuller but still safe MCP surface.

Recommended order:

1. add resources
2. add prompts
3. add progress/cancellation semantics
4. add carefully gated write tools

Good resource candidates:

- current context
- workflow definitions
- workflow run records
- office report
- pending approvals
- meeting summaries
- skills map
- agent registry

Good prompt candidates:

- explain a workflow
- summarize a blocked run
- prepare an approval request
- generate a verify checklist

Write tools should stay disabled by default and go through the same gate engine.

Implementation surfaces:

- extend `scripts/ensemble_mcp_server.py`
- align with `docs/MCP_WRITE_PLAN.md`

Acceptance criteria:

- Conitens exposes resources and prompts without widening the default write surface
- any write-capable MCP tool produces request, approval, and execution audit events

## Phase 7: A2A-Compatible Federation

Goal: expose Conitens workflows and artifacts to remote agent ecosystems without losing local policy control.

Recommended mapping:

- Conitens task/workflow run -> A2A task
- question/approval wait -> `input-required`
- office report / meeting summary / verify output -> A2A artifacts
- event stream -> task status + artifact update stream

Implementation surfaces:

- start with adapter layer around current Python Core
- reuse ideas from `packages/core/src/a2a/a2a-client.ts`
- add agent card generation from the new agent registry

Acceptance criteria:

- remote clients can discover capabilities through agent cards
- long-running tasks can be polled or streamed
- local approval and verify rules remain authoritative

## Proposed File And Module Plan

Additive module plan:

- `scripts/ensemble_registry.py`
- `scripts/ensemble_skills.py`
- `scripts/ensemble_runtime.py`
- `scripts/ensemble_gates.py`
- `scripts/ensemble_traces.py`
- `scripts/ensemble_artifacts.py`

Primary existing modules to extend:

- `scripts/ensemble.py`
- `scripts/ensemble_workflow.py`
- `scripts/ensemble_contracts.py`
- `scripts/ensemble_events.py`
- `scripts/ensemble_mcp_server.py`
- `scripts/ensemble_office.py`
- `scripts/ensemble_manifest.py`

Primary existing modules to mine for reuse or projection:

- `packages/core/src/worktree/worktree-manager.ts`
- `packages/core/src/agent-spawner/agent-spawner.ts`
- `packages/core/src/traces/trace-logger.ts`
- `packages/core/src/a2a/a2a-client.ts`
- `packages/core/src/plugins/plugin-manager.ts`

## Suggested Delivery Order

Shortest safe path:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7

Reason:

- Phase 0 removes ambiguity
- Phases 1-2 create the metadata layer
- Phases 3-5 make orchestration durable and observable
- Phases 6-7 expose the system outward only after the internal control plane is solid

## Non-Goals

Do not do these as the first move:

- replace `scripts/ensemble.py` with a new runtime
- make MCP write-enabled by default
- implement remote file mutation shortcuts
- duplicate TypeScript orchestration features in Python without a convergence decision
- collapse team semantics, skill semantics, and workflow semantics into one schema

## Verification Plan For The Roadmap Itself

Before implementation starts:

- write the control-plane ADR
- add registry and skill schemas with tests
- update docs so `README.md` and `CONITENS.md` stop conflicting

During implementation:

- keep additive modules small and independently testable
- extend `tests/test_operations_layer.py`
- add schema fixtures for invalid registry/skill/workflow cases
- keep verify-before-close covered by regression tests

Success metrics:

- one canonical runtime model
- agent registry and skill map are machine-readable
- workflow runs can pause/resume on approval
- handoffs are auditable
- office report can summarize blocked state across tasks, workflows, meetings, and approvals
- MCP/A2A adapters expose capabilities without bypassing local policy

## Source Notes

Official or primary references used for this roadmap:

- OpenAI, "A practical guide to building agents" (workflow design, tool standardization, single-vs-multi-agent guidance, human intervention): [cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
- OpenAI Agents SDK docs (agents, orchestration, hooks, guardrails, MCP servers, tracing): [openai.github.io/openai-agents-python/agents/](https://openai.github.io/openai-agents-python/agents/)
- OpenAI, "Introducing the Codex app" (parallel agents, worktrees, skills, automations), published February 2, 2026 and updated March 4, 2026: [openai.com/index/introducing-the-codex-app/](https://openai.com/index/introducing-the-codex-app/)
- Model Context Protocol spec overview (tools, resources, prompts): [modelcontextprotocol.io/specification/2025-06-18/basic](https://modelcontextprotocol.io/specification/2025-06-18/basic)
- A2A protocol specification (task ids, context ids, input-required state, streaming, artifacts): [a2a-protocol.org/dev/specification/](https://a2a-protocol.org/dev/specification/)
- Anthropic Claude Code docs (subagents, hooks, slash-command workflow surfaces): [docs.anthropic.com](https://docs.anthropic.com/)
- LangGraph docs (human-in-the-loop interrupts and approvals): [docs.langchain.com/langgraph-platform/add-human-in-the-loop](https://docs.langchain.com/langgraph-platform/add-human-in-the-loop)
- AutoGen docs (event-driven handoff pattern): [microsoft.github.io/autogen/dev/user-guide/core-user-guide/design-patterns/handoffs.html](https://microsoft.github.io/autogen/dev/user-guide/core-user-guide/design-patterns/handoffs.html)
- CrewAI docs (human input and observability surfaces): [docs.crewai.com](https://docs.crewai.com/)

## Final Recommendation

If Conitens tries to jump directly to "more agents" or "more remote orchestration," it will widen architectural drift.

If Conitens first standardizes:

- agent manifests
- skill manifests
- resumable workflow graphs
- typed handoffs
- shared gate semantics
- artifact and trace correlation

then it can absorb the best parts of the 2026 agent ecosystem without giving up the project's core identity: file-native, replayable, verify-gated orchestration.
