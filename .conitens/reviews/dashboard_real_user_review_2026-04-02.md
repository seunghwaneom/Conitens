# Dashboard Real User Review (2026-04-02)

## Scope

- Reviewed the latest dashboard changes across Wave A-D in `packages/dashboard`.
- Primary surfaces inspected:
  - `App.tsx`
  - `forward-route.ts`
  - `styles.css`
  - `AgentFleetOverview.tsx`
  - `AgentProfilePanel.tsx`
  - `AgentRelationshipGraph.tsx`
  - `OnboardingOverlay.tsx`
  - `ProposalQueuePanel.tsx`
  - `agent-fleet-model.ts`
  - `evolution-model.ts`
- Team-mode attempt failed because the current leader session is not running
  inside tmux:
  - `omx_run_team_status(job=omx-mnh7v86v) -> failed`
  - error: `Team mode requires running inside tmux current leader pane`

## Top Findings

### HIGH: The new `Agents` surface looks live, but it is entirely demo-backed

- Evidence:
  - `App.tsx` renders the full `Agents` route from `demoFleet`,
    `demoEvolution`, `demoLearningMetrics`, and `demoProposals` without a
    demo-state banner or trust disclaimer.
  - `agent-fleet-model.ts` and `evolution-model.ts` export only hard-coded demo
    data.
- Why this matters to a real user:
  - A user can reasonably assume the fleet, profile, proposal, and graph views
    reflect current runtime state because the route sits beside the real
    Forward Shell and uses the same visual language.
  - That creates trust debt immediately. Users will stop believing the rest of
    the dashboard if one major tab feels real but is not.
- Recommendation:
  - Either hard-label the entire route as `demo/simulation`, or hide the route
    until it can read real bridge-backed data.
  - Add a persistent in-view banner, not just onboarding copy.

### HIGH: `Proposal Queue` buttons create fake control instead of real control

- Evidence:
  - `ProposalQueuePanel.tsx` copies incoming props into local component state,
    then flips proposal status locally on `Approve` / `Reject`.
  - No network mutation, persistence, audit trail, or reload survival exists.
- Why this matters to a real user:
  - `Approve` and `Reject` are strong verbs. Users will assume they are making
    a real operational decision.
  - After refresh, the decision disappears. That is worse than a read-only
    placeholder because it teaches the user the UI lies.
- Recommendation:
  - Replace the buttons with read-only status chips until a real backend exists,
    or wire them into a real mutation path with audit metadata and error states.

### MEDIUM: Lifecycle action buttons are visible but unusable

- Evidence:
  - `AgentProfilePanel.tsx` renders `Pause`, `Resume`, and `Retire` buttons as
    disabled controls with `coming soon` tooltips.
- Why this matters to a real user:
  - Users read disabled controls as blocked capability, not roadmap context.
  - The panel currently increases frustration more than confidence.
- Recommendation:
  - Replace disabled buttons with a plain roadmap note or a single
    `Lifecycle actions not yet connected` status block.
  - If actions are expected soon, show the missing prerequisite instead of dead
    controls.

### MEDIUM: The relationship graph is decorative, not operational

- Evidence:
  - `AgentRelationshipGraph.tsx` uses `DEMO_EDGES` hard-coded in the component.
  - The graph offers no filtering, no legend, no click-through, and no
    timestamp/window controls.
- Why this matters to a real user:
  - A graph only earns screen space when it answers a question quickly:
    who is blocked, who is routing work, who is noisy, who changed recently.
  - The current graph looks polished but does not help an operator decide
    anything.
- Recommendation:
  - Back the graph with real relation events (handoffs, reviews, approvals,
    escalations).
  - Make nodes clickable and expose edge meaning plus recent-activity filters.

### MEDIUM: First-run onboarding is generic and modal, but the real friction is contextual

- Evidence:
  - `OnboardingOverlay.tsx` is a full-screen modal shown globally until
    dismissed.
  - It hardcodes a single bridge command and does not reflect actual connection
    state, current route, or whether the user is looking at live data vs demo.
- Why this matters to a real user:
  - The user does not need a marketing tour; they need the next safe action for
    the current screen.
  - A blocking modal is especially awkward on `office-preview` and `agents`,
    where context differs from the live bridge flow.
- Recommendation:
  - Replace the global blocking overlay with contextual empty states and a small
    dismissible help rail.
  - Add a copy button for the launch command and show the current bridge state
    inline near the connect form.

### LOW: Navigation depth and keyboard power exist, but discoverability is weak

- Evidence:
  - `App.tsx` implements `j`, `k`, `r`, and `Escape` shortcuts.
  - The route model has no deep link for selected agent, selected tab, or graph
    focus.
- Why this matters to a real user:
  - Power features help only after the UI teaches them.
  - Users cannot share or restore agent-specific context.
- Recommendation:
  - Add a keyboard/help drawer or command palette.
  - Extend routing to persist selected agent and active subview.

## Practical Improvement Priority

1. Make live/demo trust boundaries explicit on every non-live surface.
2. Remove fake actions or connect them to real persisted flows.
3. Turn the `Agents` tab into an operator tool, not a polished simulation.
4. Make onboarding contextual and non-blocking.
5. Improve discoverability for shortcuts, filters, and deep links.

## Suggested Features To Add Next

### 1. Real agent roster backed by the forward bridge

- Minimum useful payload:
  - agent id, role, room, lifecycle state, active task, last activity,
    recent errors, current owner/orchestrator
- Why:
  - This converts the `Agents` tab from a concept demo into a real operational
    screen.

### 2. Agent drill-down with recent work and decision history

- Show:
  - current task
  - last 5 handoffs
  - last validator result
  - recent proposals/evolution changes
  - recent room movement
- Why:
  - Operators usually want to answer "what is this agent doing now and why?"

### 3. Search, filter, and saved views for the fleet

- Filters:
  - status
  - role
  - room
  - error rate
  - proposal pressure
- Why:
  - The current grid works for six demo agents, not for actual scale.

### 4. Proposal details drawer with evidence and impact preview

- Include:
  - rationale
  - linked evidence refs
  - estimated blast radius
  - rollback hint
  - approval history
- Why:
  - Approving a change without evidence context is not operator-grade.

### 5. Operational relationship graph

- Replace demo edges with:
  - handoff edges
  - review edges
  - escalation edges
  - approval wait edges
- Add:
  - time-window filter
  - click-through to agent/profile
  - highlight of blocked or overloaded nodes

### 6. Route-aware onboarding/help

- Show lightweight help per route:
  - connect help on `Forward Shell`
  - simulation disclaimer on `Agents`
  - design-verification help on `Pixel Office Preview`
- Why:
  - Users need situational guidance, not one generic intro.

### 7. Shareable deep links and state persistence

- Persist:
  - selected agent
  - active subtab
  - selected graph focus
  - applied filters
- Why:
  - Makes the dashboard usable for handoffs and async discussion.

## Bottom Line

The Wave A-D additions are directionally strong, especially in visual polish and
surface breadth. The main product risk is not lack of UI polish; it is trust.
Right now the new `Agents` experience mixes live-shell aesthetics with demo-only
data and fake actions. The fastest path to a better real-user experience is to
make those trust boundaries explicit first, then connect the highest-value agent
surfaces to real runtime data.
