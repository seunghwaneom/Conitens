# Paperclip -> Conitens Integration Plan

Date: `2026-04-04`
Paperclip reference snapshot: `8adae84` (`2026-04-03 16:06:43 -0500`)

## Scope

This document analyzes `paperclipai/paperclip` as a product and architecture reference, then maps what Conitens should adopt, adapt, defer, or avoid.

This is an additive planning artifact. It does **not** change current Conitens runtime truth:

- active runtime truth remains `scripts/ensemble.py` + `.notes/` + `.agent/`
- forward stack remains additive under `.conitens/` + `scripts/ensemble_*.py`
- current dashboard target remains `packages/dashboard`

## Evidence Base

Paperclip sources inspected directly:

- `README.md`
- `doc/spec/ui.md`
- `docs/guides/board-operator/dashboard.md`
- `docs/guides/board-operator/delegation.md`
- `docs/guides/board-operator/execution-workspaces-and-runtime-services.md`
- `docs/guides/board-operator/costs-and-budgets.md`
- `docs/guides/agent-developer/how-agents-work.md`
- `docs/guides/agent-developer/task-workflow.md`
- `docs/api/overview.md`
- `docs/api/dashboard.md`
- `docs/api/issues.md`
- `docs/api/approvals.md`
- `ui/src/App.tsx`
- `ui/src/components/Layout.tsx`
- `ui/src/components/Sidebar.tsx`
- `ui/src/components/CompanyRail.tsx`
- `ui/src/components/BreadcrumbBar.tsx`
- `ui/src/components/MobileBottomNav.tsx`
- `ui/src/pages/Dashboard.tsx`
- `ui/src/pages/Inbox.tsx`
- `server/src/routes/dashboard.ts`
- `server/src/services/dashboard.ts`
- `server/src/services/heartbeat.ts`
- `server/src/services/issues.ts`
- `server/src/routes/plugins.ts`
- `server/src/services/plugin-registry.ts`
- `packages/db/src/schema/issues.ts`
- `packages/db/src/schema/agents.ts`
- `packages/db/src/schema/heartbeat_runs.ts`
- `packages/adapters/codex-local/src/index.ts`
- `packages/plugins/sdk/src/define-plugin.ts`
- `packages/plugins/sdk/src/types.ts`

Conitens sources inspected directly:

- `docs/current-architecture-status-ko.md`
- `docs/frontend/FRONTEND_REVIEW_2026-04-02.md`
- `docs/frontend/VIEW_MODEL.md`
- `docs/pixel-office-design-improvement-plan.md`
- `docs/MULTI_AGENT_WORKSPACE_ARCHITECTURE.md`
- `docs/OPERATIONS_LAYER.md`
- `packages/dashboard/src/App.tsx`
- `packages/dashboard/src/forward-route.ts`
- `packages/dashboard/src/forward-view-model.ts`
- `packages/dashboard/src/dashboard-model.ts`
- `packages/dashboard/src/styles.css`
- `packages/dashboard/src/styles/shell.css`
- `packages/dashboard/src/styles/tokens.css`
- `scripts/ensemble_forward_bridge.py`
- `scripts/ensemble_execution_loop.py`
- `scripts/ensemble_approval.py`
- `scripts/ensemble_room_service.py`
- `scripts/ensemble_replay_service.py`

## Ralplan Summary

### Principles

1. Adopt Paperclip at the product-shell layer, not as a runtime rewrite.
2. Preserve Conitens differentiation in replay, rooms, approvals, and pixel-office.
3. Prefer additive productization over schema-first cloning.
4. Move from operator-observability shell toward operator-workbench gradually.
5. Keep approval and verify gates stronger than Paperclip, not weaker.

### Decision Drivers

1. Conitens already has stronger runtime evidence and control-path discipline.
2. Paperclip is materially ahead in operator UX, task/inbox framing, and product packaging.
3. Replacing Conitens runtime concepts with Paperclip’s company/task model now would create architectural confusion and duplicate truths.

### Viable Options

#### Option A: Copy Paperclip product model broadly

Pros:

- fastest route to a recognizable “AI company OS” surface
- immediately improves task/inbox/product semantics

Cons:

- clashes with current Conitens runtime truth and additive forward contract
- risks turning Conitens into a weaker clone of Paperclip
- would force premature schema and workflow rewrites

#### Option B: Keep Conitens runtime, import Paperclip’s operator-product layer

Pros:

- highest leverage with lowest architectural damage
- lets Conitens gain inbox, workbench, and product IA improvements
- preserves replay/room/validator/approval strengths

Cons:

- requires translation work instead of copy/paste
- product language must be harmonized carefully

#### Option C: Keep current Conitens shell and only borrow styling ideas

Pros:

- lowest risk
- minimal implementation cost

Cons:

- misses the real Paperclip advantage, which is workflow framing rather than raw visuals
- leaves Conitens weak in daily operator task triage

### Chosen Direction

Choose **Option B**.

Conitens should evolve into:

- a stronger operator workbench like Paperclip at the shell and workflow layer
- while remaining evidence-first and loop-aware like current Conitens at the runtime layer

## Paperclip Strengths

### Product / UX strengths

1. It has a much clearer everyday operator story: inbox -> issues -> projects/goals -> agents -> costs/activity.
2. It treats approvals as workflow pressure inside the inbox and dashboard instead of as a detached technical artifact.
3. It is explicit about mobile and responsive operation, not just desktop inspection.
4. It treats agent work as ongoing operating work, not only as post-hoc replay.
5. It gives each product concept a distinct surface and route, which makes the system feel operable rather than experimental.

### Frontend strengths

1. The shell is disciplined and dense: `doc/spec/ui.md`, `ui/src/components/Layout.tsx`, `ui/src/components/Sidebar.tsx`.
2. Information architecture is mature: `ui/src/App.tsx`.
3. Inbox is a real triage surface, not a log viewer: `ui/src/pages/Inbox.tsx`.
4. Mobile posture is deliberate: `ui/src/components/MobileBottomNav.tsx`.
5. Plugin UI extension points are first-class: `server/src/routes/plugins.ts`, `packages/plugins/sdk/src/types.ts`.

### Backend strengths

1. Work objects are product-grade and richly scoped: `packages/db/src/schema/issues.ts`.
2. Heartbeat execution is operationalized with run/session continuity: `server/src/services/heartbeat.ts`, `packages/db/src/schema/heartbeat_runs.ts`.
3. Costs/budgets are modeled as first-order operator controls: `server/src/services/dashboard.ts`, `docs/guides/board-operator/costs-and-budgets.md`.
4. Workspaces and runtime services are integrated into task execution semantics: `docs/guides/board-operator/execution-workspaces-and-runtime-services.md`.
5. Plugins, adapters, and UI contributions form a coherent extension model: `server/src/services/plugin-registry.ts`, `packages/plugins/sdk/src/define-plugin.ts`.

## Where Conitens Is Stronger

1. Conitens has a sharper execution-loop model: `scripts/ensemble_execution_loop.py`.
2. Approval handling is more explicitly safety-oriented: `scripts/ensemble_approval.py`.
3. Replay, rooms, tool events, insights, and handoff artifacts are more clearly treated as evidence surfaces: `scripts/ensemble_room_service.py`, `scripts/ensemble_replay_service.py`.
4. Current architecture documentation draws harder truth boundaries than Paperclip does: `docs/current-architecture-status-ko.md`.
5. Pixel-office gives Conitens a differentiated mental model for spatial collaboration and flow tension: `docs/pixel-office-design-improvement-plan.md`.

## Core Translation

Paperclip concept -> Conitens translation:

- company -> workspace / runtime scope / operator domain
- issues -> run-bound task items, approval items, handoff items, operator interventions
- inbox -> pending operational attention center
- dashboard -> operator summary and workload board
- org chart -> current agent/fleet topology plus room/role topology
- heartbeat runs -> current run / iteration / worker execution evidence
- budgets -> runtime spend and quota governance
- plugin system -> future additive extension plane over current MCP/skill surfaces

The important point is this:

Conitens should **translate** Paperclip’s product semantics into its own runtime vocabulary, not rename Conitens internals to match Paperclip.

## UI / UX Plan

### What to adopt

1. Add an operator-first **Inbox / Attention** surface as a primary route beside runs and agents.
2. Reframe the top shell from “bridge/run inspector” to “operator workbench” while keeping run detail intact.
3. Surface pending approvals, open questions, blocked runs, and stale handoffs as one triage stream.
4. Introduce a clearer left-rail IA:
   - Overview
   - Inbox
   - Runs
   - Agents
   - Rooms / Replay
   - Office
   - Policies / Approvals
5. Add responsive bottom-nav behavior for mobile or narrow widths.
6. Keep dense keyboard-first behavior as a design target.
7. Use breadcrumb + contextual right-panel patterns for detail views.
8. Turn approval and question handling into workflow objects, not just detail-panel data.

### What to adapt, not copy

1. Do **not** replace pixel-office with a generic SaaS dashboard.
2. Do **not** remove Conitens’ replay-first evidence surfaces.
3. Do **not** collapse room/replay/timeline into a generic “activity” page.
4. Do **not** force Paperclip’s “company” metaphor onto every Conitens object.

### Suggested Conitens IA vNext

Primary shell:

- `Overview`: current operational summary
- `Inbox`: approvals, questions, blocked items, stale work, failed validations
- `Runs`: current forward runs list
- `Run Detail`: existing replay/state-doc/context/graph tabs
- `Agents`: current fleet view
- `Rooms`: room timeline / replay / handoff focus
- `Office`: spatial lens and office preview

Secondary contextual rails:

- right rail for selected run, agent, approval, or room
- summary strips for active risks and pending decisions

## Frontend Plan

### Near-term changes

1. Keep `packages/dashboard/src/App.tsx` as the shell root but refactor route semantics from:
   - `runs`
   - `run-detail`
   - `office-preview`
   - `agents`

   toward:

   - `overview`
   - `inbox`
   - `runs`
   - `run-detail`
   - `agents`
   - `office`
2. Extend `packages/dashboard/src/forward-route.ts` to support first-class operator routes.
3. Add a new dashboard-level view model for triage items on top of:
   - approvals
   - validator failures
   - question/open approval signals
   - handoff events
   - blocked/review task states
4. Keep current visual language tokens in `packages/dashboard/src/styles/tokens.css`.
5. Use Paperclip’s dense/scannable shell ideas, but preserve Conitens’ more atmospheric shell styling from:
   - `packages/dashboard/src/styles/shell.css`
   - `packages/dashboard/src/styles/office-preview.css`

### Frontend architecture recommendation

Add these view-model layers before adding new screens:

- `operator-inbox-model.ts`
- `operator-summary-model.ts`
- `approval-attention-model.ts`
- `run-health-model.ts`

Reason:

Paperclip’s win is not individual widgets. It is the clarity of derived operator objects. Conitens needs those derivations before it needs more panels.

### Responsive strategy

Adopt from Paperclip:

- mobile bottom nav
- sidebar collapse / icon-only rail
- stronger narrow-screen route prioritization

But keep Conitens-specific:

- office preview as a special large-format view
- graph / replay / room detail as stacked operator panels rather than tiny mobile replicas

## Backend / Runtime Plan

### Adopt now

1. Introduce a derived **operator inbox service** over current forward data.
2. Add derived **run health summary** endpoints akin Paperclip dashboard summary.
3. Add spend/budget summary projections if not yet surfaced consistently in the dashboard.
4. Formalize workspace/runtime service metadata as a clearer operator surface.
5. Treat agent/fleet state as a first-class operator model, not just demo fixtures.

### Adopt later

1. Durable task/issue-style operator entities that sit above runs and iterations.
2. Portable plugin host comparable to Paperclip’s plugin runtime.
3. Project/workspace/runtime controls with richer operational inheritance.
4. Multi-tenant or company-scoped partitioning semantics.

### Avoid for now

1. Replacing run/iteration truth with issue truth.
2. Rewriting Conitens to a broad REST product model before runtime boundaries settle.
3. Introducing Paperclip-scale schema breadth before the operator model is validated in the forward dashboard.

## Data Model Plan

### Recommended additive entities

Phase 1 derived, not canonical:

- `attention_item`
- `run_health_summary`
- `agent_workload_summary`
- `approval_attention_summary`
- `handoff_attention_summary`

These should be projections derived from current forward state, not new truth owners.

Phase 2 canonical additions if Phase 1 proves useful:

- `operator_tasks`
- `operator_queues`
- `execution_workspace_summary`
- `budget_policy_summary`

### Why this matters

Paperclip succeeds because operators work with stable, human-scale objects. Conitens currently exposes lower-level runtime truth very well, but lacks enough derived product objects for day-to-day management.

## Operator Workflow Changes

### Current Conitens workflow

- inspect run
- inspect replay
- inspect room
- inspect approvals
- inspect office preview

This is strong for diagnosis and evidence, weaker for triage and action ordering.

### Target workflow

- open inbox
- clear pending approvals / questions / blocked items
- scan run health summary
- drill into run detail only when needed
- use office view to understand coordination load and room pressure

This makes Conitens feel more operable without losing its runtime discipline.

## Design System / Figma Rules Draft

These are the project-specific UI rules that emerged from the comparison and current codebase analysis.

### Component and styling rules

- UI code for the forward shell belongs in `packages/dashboard/src/components/`
- route and orchestration state belongs in `packages/dashboard/src/App.tsx` and view-model modules
- shell tokens must come from `packages/dashboard/src/styles/tokens.css`
- shared shell composition must stay aligned with `packages/dashboard/src/styles/shell.css`
- spatial/office presentation must remain isolated behind `office-preview.css`, `office-stage.css`, and related modules
- do not hardcode Paperclip’s neutral dark palette directly; map any imported ideas onto Conitens shell tokens
- do not introduce generic card mosaics by default; prefer strips, rails, panels, and sectional surfaces

### Figma-to-code rules

- designs for operator shell work should target `packages/dashboard`
- Figma-derived layout should preserve Conitens route grammar and forward-only data boundaries
- new triage or inbox surfaces should reuse existing shell tokens and panel grammar before creating new visual systems
- approval, replay, room, and insight panels should remain visibly related, even if new operator summary views are added
- office and spatial views should remain a differentiated mode, not be flattened into a generic dashboard tab

## Phased Rollout

### Phase 1: Product Shell Upgrade

Goal:

Make Conitens feel like an operator workbench without changing runtime truth.

Deliver:

- inbox route
- operator summary strip
- derived attention items
- improved left-rail IA
- better responsive shell behavior

Primary touchpoints:

- `packages/dashboard/src/App.tsx`
- `packages/dashboard/src/forward-route.ts`
- `packages/dashboard/src/forward-view-model.ts`
- new operator summary / inbox model modules
- `scripts/ensemble_forward_bridge.py`

### Phase 2: Runtime Productization

Goal:

Expose stronger operational objects above current run/iteration detail.

Deliver:

- fleet health summaries
- workspace/runtime summaries
- budget/quota summaries
- stronger agent detail surfaces

Primary touchpoints:

- `scripts/ensemble_forward_bridge.py`
- forward repository query layer
- `packages/dashboard/src/components/*`

### Phase 3: Structured Operator Tasks

Goal:

Introduce Paperclip-like operability without throwing away Conitens runtime evidence.

Deliver:

- operator task entities or queues
- richer workflow linking between runs, approvals, rooms, and work items
- optional plugin/extension surfaces for operator tooling

Primary touchpoints:

- forward data model
- dashboard routes
- future extension APIs

## Code-Review Style Risks

### High-risk mistakes

1. Building a Paperclip-like inbox directly on top of ad hoc frontend heuristics without a backend-derived attention model.
2. Replacing Conitens route vocabulary with company/project/issue vocabulary before confirming the runtime mapping.
3. Letting the new operator shell imply that forward stack is already the runtime truth.
4. Flattening room/replay/insight surfaces into generic task-management UI.

### Medium-risk mistakes

1. Copying Paperclip’s dark neutral styling and losing Conitens’ stronger identity.
2. Introducing too many top-level routes at once.
3. Mixing demo fleet models with live fleet semantics in the same operator views.

## Final Recommendation

Conitens should not become “Paperclip but with rooms.”

It should become:

- **Paperclip-level operator clarity**
- plus **Conitens-level runtime evidence, approval rigor, replayability, and spatial collaboration**

That means the next correct move is not a runtime rewrite. It is a **product-shell upgrade** centered on inbox, operator triage, derived work objects, and clearer IA, while preserving the current forward-loop architecture as the technical core.
