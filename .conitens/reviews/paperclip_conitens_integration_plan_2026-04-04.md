# Paperclip Comparative Integration Plan

Date: `2026-04-04`
Source repo: `paperclipai/paperclip` @ `8adae84`
Target repo: `Conitens`

## 1. Executive Summary

Paperclip is stronger than current Conitens as a productized operator control plane. It has a clearer business object model (`company -> goal/project -> issue -> heartbeat run -> approval/cost/activity`), a denser task/inbox workflow, stronger adapter/plugin packaging, and a more legible board-operator UX.

Current Conitens is stronger in loop-state rigor, replay/evidence separation, approval/validator gating, and additive forward-runtime architecture. Its weakness is not orchestration depth, but product packaging: the operator shell still exposes run-centric internals more than durable business objects.

The correct move is not "make Conitens look like Paperclip." The correct move is:

1. translate Paperclip's operator primitives into Conitens vocabulary
2. keep Conitens' forward/runtime truth and approval discipline intact
3. add a task/agent/workspace control plane on top of the existing loop/replay substrate

## 2. What Paperclip Actually Is

### Product shape

Paperclip presents agent orchestration as a company-management product, not a run debugger.

- Primary objects: companies, agents, goals, projects, issues, approvals, costs, routines, execution workspaces.
- Primary operator surfaces: dashboard, inbox, issues, org chart, agents, costs, activity.
- Primary runtime loop: heartbeat-driven execution bursts rather than permanently open sessions.

Key evidence:

- README product positioning and feature set: `/tmp/paperclip/README.md`
- UI shell and route structure: `/tmp/paperclip/ui/src/App.tsx`
- Dashboard guide: `/tmp/paperclip/docs/guides/board-operator/dashboard.md`
- Delegation guide: `/tmp/paperclip/docs/guides/board-operator/delegation.md`

### Backend shape

Paperclip has an explicit domain model backed by DB tables and route/service boundaries.

- DB schema for issues/agents/heartbeat runs: `/tmp/paperclip/packages/db/src/schema/issues.ts`, `/tmp/paperclip/packages/db/src/schema/agents.ts`, `/tmp/paperclip/packages/db/src/schema/heartbeat_runs.ts`
- Dashboard aggregation service: `/tmp/paperclip/server/src/services/dashboard.ts`
- Heartbeat orchestration and workspace realization: `/tmp/paperclip/server/src/services/heartbeat.ts`
- REST routes organized by domain: `/tmp/paperclip/server/src/routes/*.ts`

### Frontend shape

Paperclip has a conventional operator app shell.

- Nested routes and company-prefixed navigation: `/tmp/paperclip/ui/src/App.tsx`
- Shared layout, sidebar, breadcrumb bar, command palette, properties panel: `/tmp/paperclip/ui/src/components/Layout.tsx`
- Dense, scan-first dashboard and inbox workflows: `/tmp/paperclip/ui/src/pages/Dashboard.tsx`, `/tmp/paperclip/ui/src/pages/Inbox.tsx`
- Tokenized theme and Tailwind-driven UI system: `/tmp/paperclip/ui/src/index.css`

## 3. Current Conitens Baseline

Conitens already has the hardest lower layers Paperclip depends on, but they are exposed through a more technical, forward-runtime-oriented shell.

### Strong existing layers

- additive forward runtime: `/mnt/d/Google/.Conitens/docs/current-architecture-status-ko.md`
- read/write approval queue: `/mnt/d/Google/.Conitens/scripts/ensemble_approval.py`
- restartable execution loop with validator + retry + escalation: `/mnt/d/Google/.Conitens/scripts/ensemble_execution_loop.py`
- room/replay/insight evidence layer: `/mnt/d/Google/.Conitens/scripts/ensemble_room_service.py`, `/mnt/d/Google/.Conitens/scripts/ensemble_replay_service.py`
- forward bridge with loopback auth and approval mutations: `/mnt/d/Google/.Conitens/scripts/ensemble_forward_bridge.py`
- operator dashboard shell and office visualization: `/mnt/d/Google/.Conitens/packages/dashboard/src/forward-route.ts`, `/mnt/d/Google/.Conitens/packages/dashboard/src/dashboard-model.ts`

### Weak current product packaging

- route model is still narrow and run-centric
- dashboard metrics are derived from task/event state, not durable operator entities
- there is no explicit task inbox / agent registry / workspace registry / cost center in the forward product surface
- the shell still feels like a forward-runtime inspection console rather than a business operating system

## 4. RALPLAN-Style Summary

### Principles

1. Preserve Conitens runtime truth and approval/verify gates.
2. Add durable operator objects before adding more visual chrome.
3. Translate Paperclip concepts into Conitens vocabulary instead of cloning names blindly.
4. Prefer additive forward-surface expansion over runtime replacement.
5. Stage UI work behind explicit backend ownership and state boundaries.

### Decision Drivers

1. Conitens already has stronger loop correctness than Paperclip in validator/replay/approval discipline.
2. Paperclip has a clearer operator-facing information architecture and domain model.
3. The highest leverage is to productize Conitens' existing state, not rebuild orchestration from scratch.

### Viable Options

#### Option A: Clone Paperclip UX directly

Pros:
- fast conceptual reuse
- proven operator shell patterns

Cons:
- mismatched vocabulary and runtime truth
- risks collapsing Conitens' run/room/replay evidence model into a generic task manager
- pushes frontend ahead of backend ownership

Verdict: reject.

#### Option B: Keep current Conitens shell and only add minor panels

Pros:
- low risk
- minimal churn

Cons:
- does not fix the real product gap
- leaves Conitens too internal-facing and too run-centric

Verdict: reject.

#### Option C: Adopt Paperclip's operator primitives selectively on top of Conitens forward state

Pros:
- keeps Conitens architecture intact
- upgrades product legibility
- allows staged rollout by domain object

Cons:
- needs a new intermediate domain layer
- requires route expansion and view-model discipline

Verdict: choose this option.

### ADR

- Decision: Introduce a Conitens operator control plane inspired by Paperclip's object model and board UX, but grounded in existing forward runtime state and evidence architecture.
- Drivers: product clarity, operator throughput, additive compatibility, preserved verification gates.
- Alternatives considered: direct UI clone, no-op/minor shell polish.
- Why chosen: highest product leverage with lowest architectural betrayal.
- Consequences: new task/agent/workspace/budget abstractions, route expansion, and API/domain growth.
- Follow-ups: define domain tables/contracts, expand forward bridge, unify dashboard IA, write design-system rules.

## 5. Detailed Comparison

### 5.1 UI/UX

Paperclip strengths:

- clear "board operator" posture instead of generic dashboard posture
- inbox as action surface, not just notification list
- stable left-nav object model
- dense-but-readable layout grammar with breadcrumb + properties panel
- keyboard-first affordances and mobile-aware shell behavior

Conitens strengths:

- richer atmospheric identity in the office/room visualization layer
- better explanation of replay/evidence context
- stronger distinction between runtime digest, repo digest, and replay artifacts

What Paperclip does better today:

- a human can answer "what needs attention now?" in one screen
- task ownership and agent ownership are explicit
- company/agent/workspace structure is legible without reading backend docs

What Conitens does better today:

- approval and validator events are more rigorously integrated into execution semantics
- room/replay/insight separation is architecturally cleaner
- forward-only control-plane discipline is clearer

### 5.2 Frontend architecture

Paperclip:

- route-rich app shell
- page-level ownership by domain object
- tokenized styling with a standard component system
- explicit API client modules per domain

Conitens:

- currently narrower forward route surface
- stronger view-model separation on the run/replay path
- more handcrafted CSS and visual grammar
- good route-level style layering started, but not yet generalized as a product design system

### 5.3 Backend/runtime

Paperclip:

- explicit issue/agent/heartbeat tables
- heartbeat service handles workspace realization and runtime context
- first-class cost/budget enforcement
- adapter and plugin ecosystems are productized

Conitens:

- explicit loop repository and execution loop
- approval queue and replay are already durable
- lacks a first-class operator domain layer for tasks/agents/workspaces as product objects
- current bridge is run-centric, not portfolio-centric

## 6. What Conitens Should Adopt

### Adopt now

1. **Inbox-first operator surface**
   - Add a "Needs Attention" surface above raw replay/runs.
   - Pull from approvals, validator failures, blocked tasks, stale workspaces, and unanswered rooms.

2. **Durable task object separate from raw run**
   - Introduce a stable task/work item entity that can own one or many runs/iterations.
   - Conitens today treats run as the main visible object too often.

3. **Agent registry with explicit role/reporting metadata**
   - Current office/room visuals imply organization but do not expose a durable operator roster.

4. **Workspace registry**
   - Paperclip's execution workspace model maps well to Conitens' forward runtime and future repo-aware execution.

5. **Budget/quota policy layer**
   - Not only money. Conitens should expose token, turn, approval, and retry budgets as operator-visible controls.

6. **Plugin-capability framing**
   - Not necessarily Paperclip's exact SDK first, but a formal extension boundary for dashboards, tools, and adapters.

### Adopt later

1. multi-company tenancy
2. marketplace / blueprint store
3. full REST object parity with Paperclip
4. embedded Postgres-style operational packaging
5. full mobile product parity

### Do not adopt directly

1. Paperclip's "company" terminology as-is
2. a wholesale Tailwind/shadcn rewrite of Conitens dashboard
3. heartbeat semantics copied literally into every Conitens mode
4. replacing Conitens replay-first evidence model with issue comments as the sole narrative surface

## 7. UI/UX Plan

### Visual thesis

Conitens should feel like a calm operator war-room: editorial, high-signal, slightly architectural, with the office/room metaphor retained as a secondary spatial layer rather than the primary navigation shell.

### Content plan

- Hero / top band: operator summary, critical gates, live system posture
- Support band: inbox and active task lanes
- Detail band: selected task / room / workspace / approval context
- Final CTA band: launch, approve, reroute, resume

### Interaction thesis

1. A persistent left rail organizes by operator objects, not by implementation views.
2. The top strip behaves like an "attention ledger" that changes with approvals, blockers, and stale execution.
3. The office preview becomes a drill-down visualization, not the first thing users must parse.

### Recommended IA

#### Keep

- runs
- replay
- rooms
- approvals
- agents
- office preview

#### Add

- inbox
- tasks
- workspaces
- budgets
- activity

#### Reframe

- current run list becomes "execution traces"
- office preview becomes "spatial operations"
- state docs become "system memory"

### Concrete screen plan

#### 1. Inbox / Attention

Purpose:
- one screen for approvals, blocked work, validator failures, stale tasks, and unresolved room questions

Conitens touchpoints:
- `/mnt/d/Google/.Conitens/scripts/ensemble_approval.py`
- `/mnt/d/Google/.Conitens/scripts/ensemble_replay_service.py`
- `/mnt/d/Google/.Conitens/packages/dashboard/src/dashboard-model.ts`

#### 2. Tasks

Purpose:
- show durable work items with status, owner, current execution, linked approvals, linked rooms, and linked evidence

#### 3. Agents

Purpose:
- turn existing presence/office identity into a roster with role, mode, latest run, latest blocker, approval sensitivity, and workspace attachment

#### 4. Workspaces

Purpose:
- expose repo/worktree/runtime context as a first-class operator surface

#### 5. Costs / Budgets

Purpose:
- show token budgets, retry burn, approval load, and runtime saturation before adding money-centric billing

### UX risks

1. If Conitens copies Paperclip's task-manager look too literally, it will erase the repo's distinctive spatial/replay identity.
2. If the office view remains primary while tasks/inbox are added, the shell will feel split-brained.
3. If runs remain the only durable visible object, inbox/tasks will be fake overlays and quickly drift.

## 8. Frontend Plan

### Current constraints

- current route model is only `runs`, `run-detail`, `office-preview`, `agents`: `/mnt/d/Google/.Conitens/packages/dashboard/src/forward-route.ts`
- current dashboard metrics are derived from event/task snapshots, not stable operator objects: `/mnt/d/Google/.Conitens/packages/dashboard/src/dashboard-model.ts`
- current bridge client structure is now cleanly modularized and ready for expansion: `/mnt/d/Google/.Conitens/packages/dashboard/src/forward-bridge.ts`

### Recommended frontend changes

#### Phase FE-1: IA expansion without visual reset

- expand route model to include `inbox`, `tasks`, `workspaces`, `budgets`, `activity`
- keep current shell tokens and panel grammar
- add page-level view-models similar to Paperclip's API client/page structure

Likely files:

- `/mnt/d/Google/.Conitens/packages/dashboard/src/forward-route.ts`
- `/mnt/d/Google/.Conitens/packages/dashboard/src/App.tsx`
- new `packages/dashboard/src/*-view-model.ts`
- new `packages/dashboard/src/components/*Panel.tsx`

#### Phase FE-2: Operator shell unification

- move run list down one level in importance
- add left rail and top attention strip
- keep office preview as a specialized route/tab

#### Phase FE-3: Agent/task/workspace detail pages

- introduce right-detail/context panel pattern
- unify approval, replay, room, and state-doc references under each object page

### Frontend design-system rules draft

Derived from the repo and the Figma rules prompt:

- Tokens live in `/mnt/d/Google/.Conitens/packages/dashboard/src/styles/tokens.css`.
- Styling remains layered CSS and CSS modules, not Tailwind migration.
- Shared shell primitives should live under `packages/dashboard/src/components/` and route/state mapping under dedicated view-model files.
- Figma-to-code work should map colors/spacing/type to existing CSS variables before adding new tokens.
- The office/pixel layer stays a specialized visual system and should not become the base style for all operator views.
- Use `IBM Plex Sans` + `JetBrains Mono` as the primary shell system unless a future design pass deliberately changes the brand language.

## 9. Backend / Runtime Plan

### Core problem

Conitens currently exposes:

- run
- iteration
- approval request
- room
- replay item
- insight

It does not yet expose a stable product domain like:

- task/work item
- agent roster object
- execution workspace registry
- budget policy registry

### Recommended backend additions

#### Phase BE-1: Task domain

Add a durable work-item entity above run/iteration.

Suggested fields:

- `task_id`
- `title`
- `objective`
- `status`
- `priority`
- `owner_agent_id`
- `linked_run_id`
- `linked_iteration_id`
- `linked_room_ids`
- `blocked_reason`
- `acceptance_json`
- `workspace_ref`

Map to existing forward runtime rather than replacing it.

Primary touchpoints:

- `/mnt/d/Google/.Conitens/scripts/ensemble_loop_repository.py`
- `/mnt/d/Google/.Conitens/scripts/ensemble_execution_loop.py`
- `/mnt/d/Google/.Conitens/scripts/ensemble_context_markdown.py`

#### Phase BE-2: Agent registry

Create a durable agent/operator registry with:

- role
- mode
- allowed tools / approval sensitivity
- default workspace
- latest status
- current task
- latest run/review state

Reuse `.agent/` as config truth where possible; add projection/state rather than replacing config files.

#### Phase BE-3: Workspace registry

Track repo/worktree/runtime bindings explicitly.

This is the strongest Paperclip pattern Conitens can borrow because it connects execution, approval risk, and UI observability.

Likely touchpoints:

- future `scripts/ensemble_workspace_*.py`
- `/mnt/d/Google/.Conitens/scripts/ensemble_forward_bridge.py`
- `.agent/workflows/`

#### Phase BE-4: Budget and policy layer

Start with Conitens-native budgets:

- token budget
- retry budget
- approval budget
- runtime budget
- tool/network budget

These can later map to monetary cost, but operator value appears earlier if they begin as control budgets.

### What is structurally stronger in Paperclip today

1. explicit domain tables for operator objects
2. clean adapter/product packaging
3. workspace realization model
4. budget/cost visibility as a first-class operator concern

### What Conitens already has under different naming

1. approval workflow -> `approval_requests` and `ApprovalInterruptAdapter`
2. audit/activity/replay -> replay/room/tool/insight timeline
3. execution loop -> `IterativeBuildLoop`
4. strategy/validation/evidence -> task plan + validator results + findings/progress projections

## 10. Data Model Translation

### Recommended Conitens object model

Do not use Paperclip's `company` model immediately. Use:

- `mission` or `workspace` as the top operator scope
- `task` as the durable work object
- `agent_profile` as the durable worker/role object
- `execution_workspace` as repo/runtime scope
- `approval_request` as existing gate object
- `evidence_timeline` as replay aggregation

### Suggested relationships

- one task -> many runs
- one run -> many iterations
- one task -> many rooms
- one task -> zero or many approvals
- one execution workspace -> many tasks
- one agent profile -> many tasks and runs

This lets Conitens retain its forward loop truth while adopting a more operable product surface.

## 11. Review-Style Risks

### [P1] Route model is too narrow for a Paperclip-style control plane

Evidence:
- `/mnt/d/Google/.Conitens/packages/dashboard/src/forward-route.ts`

Risk:
- If inbox/tasks/workspaces are layered without rethinking route ownership, the shell will accumulate modal/panel complexity and lose navigational clarity.

Mitigation:
- Expand route ownership before adding more panels.

### [P1] Current bridge is run-centric, not domain-centric

Evidence:
- `/mnt/d/Google/.Conitens/scripts/ensemble_forward_bridge.py`

Risk:
- Adding Paperclip-like pages directly on top of run endpoints will push aggregation complexity into the frontend and create unstable derived semantics.

Mitigation:
- Add task/agent/workspace summary endpoints only after domain ownership is defined in the repository.

### [P1] Execution loop is single-run oriented; heartbeat semantics cannot be pasted on top

Evidence:
- `/mnt/d/Google/.Conitens/scripts/ensemble_execution_loop.py`

Risk:
- A naive "heartbeat" port would mix scheduling, assignment, approval pause/resume, and retry logic without a portfolio coordinator.

Mitigation:
- Add a scheduler/cadence layer above the existing loop rather than mutating the loop into a scheduler.

## 12. Recommended Rollout

### Phase 1: Productize what already exists

Goal:
- inbox + tasks + richer agents shell on top of existing forward runtime

Do:
- task entity
- inbox summary endpoint
- agent roster projection
- route expansion

Do not:
- replace runtime truth
- add multi-company

### Phase 2: Add workspace and budget control plane

Goal:
- make execution location, runtime load, and cost/risk visible

Do:
- execution workspace registry
- budget/quota policies
- workspace/operator pages

### Phase 3: Add ecosystem leverage

Goal:
- templates, plugins, import/export, and reusable org patterns

Do:
- plugin capability surface
- packaged team/task templates
- optional marketplace-like import surface

### Phase 4: Only then consider company-style packaging

Goal:
- higher-order operating system for many teams / missions

Do:
- top-level portfolio scope if the product genuinely needs it

## 13. Bottom Line

Paperclip should influence Conitens most strongly in four areas:

1. operator information architecture
2. durable task/agent/workspace object model
3. explicit budget/workspace controls
4. adapter/plugin productization

It should not displace Conitens' existing strengths:

1. validator-first completion
2. replay/evidence separation
3. forward-only additive migration path
4. approval-gated risky actions

The best next move is a Conitens-native "operator control plane" batch, not a Paperclip clone batch.
