# Conitens Frontend Rebaseline v4.1

Implementation status note:

- FE-1 implemented
- FE-3 implemented
- FE-5 implemented
- FE-6 implemented
- FE-7 implemented
- FE-8 stabilization implemented in scoped form

This document remains the planning baseline, but the completed items above are
now superseded by the actual implementation in `packages/dashboard`,
`scripts/ensemble_forward_bridge.py`, and the `docs/frontend/*.md` status docs.

Status: **Supersedes v2, v3, and v4 for frontend work.**

This v4 document folds in the latest structural review and is intended to be **self-contained**.
It is optimized for a **CLI-first / Antigravity-first** operating model where agents primarily run via terminal programs and the frontend is a **read-mostly control shell**, not the execution substrate.

---

## 1. Final decisions

### 1.1 Operating model
- **Primary runtime:** CLI / Antigravity program
- **Frontend:** optional control-plane shell for visibility, replay, approvals, and later live intervention
- **Source of truth:** runtime files + SQLite, never the browser
- **v0 assumption:** single local operator

### 1.2 Control-plane gate
Frontend work is blocked until one of these is true:
1. The forward stack is promoted to the main runtime, or
2. A clearly scoped `--forward` mode exists and the frontend is explicitly limited to that mode.

Do **not** build a frontend against a forward stack that is not independently runnable.

### 1.3 Runtime/document boundaries
- `ensemble.py + .notes/ + .agent/` may still be the active/legacy runtime.
- `.conitens/ + SQLite + forward services` is the forward runtime.
- Frontend v4 targets **forward runtime only** unless an explicit legacy bridge is added.

### 1.4 Digest boundaries
Keep these separate:
- `.conitens/context/LATEST_CONTEXT.md` = **runtime loop digest**
- `.vibe/context/LATEST_CONTEXT.md` = **repo intelligence digest** (optional, if vibe-kit is present)

API consumers must not treat them as aliases.

Recommended bridge response shape:
```json
{
  "runtime_latest": {
    "path": ".conitens/context/LATEST_CONTEXT.md",
    "content": "..."
  },
  "repo_latest": {
    "path": ".vibe/context/LATEST_CONTEXT.md",
    "content": "..."
  }
}
```

If `.vibe/context/LATEST_CONTEXT.md` does not exist, return `repo_latest: null`.
Do **not** invent a third canonical digest unless the repo explicitly adopts one.

### 1.5 Bridge philosophy
- **BE-1a** = read-only adapter over existing Python services and SQLite
- **BE-1b** = optional live updates + approvals after read-only UI is already working
- Do not call BE-1 “thin” unless the endpoint count and runtime scope are actually thin.

### 1.6 Transport choice
For v0, prefer:
- **REST** for read-mostly data access
- **SSE** for one-way live updates if needed
- **WebSocket** only if true bidirectional room control becomes necessary

Given the CLI-first model, WebSocket is **not** on the critical path.


### 1.7 Frontend stack
Unless the repository already has an established frontend stack, use:
- **React 19**
- **Vite**
- **Tailwind CSS**
- **Radix primitives**
- **optional shadcn-generated components** (copy-in UI, not a required runtime dependency)
- **zustand or equivalent lightweight store** for local UI state

Do not let the FE agent choose a different framework family unless the repository already clearly does so.

---

## 2. What is explicitly out of scope for v0

- No multi-user auth/roles
- No full duplex collaborative editing in browser
- No graph editor
- No browser-first execution path
- No attempt to make frontend the operator-of-record
- No mandatory live transport before read-only replay works

---

## 3. Required pre-flight checks for every frontend/backend prompt

Every Codex prompt below must begin with this pre-flight block:

```text
Pre-flight check:
- Verify these files or equivalents exist before proceeding:
  - packages/protocol/src/event.ts (if referenced by this repo)
  - scripts/ensemble_room.py (if room mapping depends on it)
  - .conitens/context/task_plan.md (if forward mode exists)
- If any required artifact is missing, stop and report exactly what is missing.
- Do not invent replacement files or concepts silently.
```

If the repo uses different filenames, the prompt executor must discover and document the actual equivalents before implementation.

---

## 4. Quantitative MVE gates

Use these thresholds to decide whether the bridge is truly lightweight or whether a decoupling sprint is required.

| Checkpoint | Pass threshold | If failed |
|---|---:|---|
| Service module import | target import succeeds in **<= 5s** | run decoupling sprint |
| `GET /api/runs` | JSON response in **< 2s** locally | inspect DB / import coupling |
| `GET /api/runs/:id/replay` | replay payload in **< 2s** locally | inspect replay service boundary |
| FE shell run list render | list appears without hardcoded mocks | fix API contract / FE adapter |

If `GET /api/runs` takes longer than expected because the service layer is runtime-coupled, stop calling the bridge “thin” and schedule decoupling work.

---

## 5. Dependency graph / critical path

### Minimum path to something useful
1. **P0** — runtime + service audit
2. **BE-1a** — read-only bridge
3. **FE-0** — contracts and mappings
4. **FE-1** — shell + run list
5. **FE-2** — typed data layer
6. **FE-3** — replay/state-docs view

### Later path
7. **BE-1b** — live transport + approvals
8. **FE-4** — room live updates
9. **FE-5** — graph inspector
10. **FE-6** — approvals center
11. **FE-7** — insights view
12. **FE-8** — stabilization / E2E / cleanup

This means **FE-1~FE-3 are intentionally unblocked by BE-1a alone**.

---

## 6. Prompt P0 — Runtime + Service Audit (merged P0/P0a)

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Produce a single audit that determines:
1. which runtime is actually active today,
2. whether forward runtime is independently runnable,
3. which existing Python service modules can be imported without booting the full runtime,
4. whether frontend work should target forward mode now or be blocked pending promotion.

Do not implement the frontend or API bridge in this step.

Scope
- Inspect runtime entry points such as ensemble.py, forward loop entry points, and related scripts.
- Inspect whether .notes/.agent or .conitens/SQLite is the current operator-facing truth.
- Inspect existing service modules such as room/replay/insight/approval/loop repository/context projection modules.
- Measure importability and rough coupling.
- Identify whether any protocol/event registry actually exists in the repo.

Deliverables
1. docs/frontend/RUNTIME_AND_SERVICE_AUDIT.md
2. docs/frontend/CONTROL_PLANE_DECISION.md
3. updated PLANS.md

Required analysis sections
- Active runtime today
- Forward runtime status
- Can frontend safely target forward mode now?
- Existing service modules and their import status
- Existing room abstraction mapping candidates
- Existing protocol/event type sources
- Recommended HTTP framework for BE-1a
- Recommended next step: BE-1a or decoupling sprint

Acceptance criteria
- The audit explicitly states whether frontend work is blocked or unblocked.
- The audit records which modules imported successfully and which failed.
- If import failures occur, list the concrete coupling causes.
- The document says whether the frontend should target only `--forward` mode.

Constraints
- Do not use `/plan first` or any environment-specific slash command.
- Do not invent missing services.
- Do not modify runtime code except for trivial instrumentation needed to test imports.
```

---

## 7. Prompt BE-1a — Read-only Bridge

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Build a read-only local bridge that exposes existing forward-runtime state and service outputs to the frontend.
This is not a new business-logic backend. Reuse existing Python services wherever possible.

Framework guidance
- Prefer FastAPI if existing service modules are Python and importable.
- If the repo already has a native HTTP backend framework, reuse it instead of introducing a second one.
- Document the final framework choice in docs/frontend/BE1A_API.md.

Scope
- Read-only endpoints only.
- No live transport yet.
- No approval mutation endpoints yet.
- No reconnect, seq buffers, ring buffers, or WebSocket gap recovery.

Preferred endpoint set
- GET /api/runs
- GET /api/runs/:id
- GET /api/runs/:id/replay
- GET /api/runs/:id/state-docs
- GET /api/runs/:id/context-latest
- GET /api/rooms/:id/timeline (only if room mapping is already confirmed)

Implementation rules
- Wrap existing Python services first.
- If a required endpoint cannot be backed by an existing service/module, stop and document the missing boundary instead of inventing a large new subsystem.
- State-docs may be served from existing projection functions. Do not parse markdown if the markdown is already projected from SQLite.
- For context-latest, keep runtime digest and repo digest separate in the response.

Required docs
- docs/frontend/BE1A_API.md
- docs/frontend/STATE_BOUNDARY.md
- docs/frontend/ROOM_MAPPING.md (if not already finalized in P0)

Required tests
- unit test for each projection mapper used
- response-shape tests for each route
- integration smoke for GET /api/runs and GET /api/runs/:id/replay

Acceptance criteria
- Local import path and app boot are documented.
- GET /api/runs returns JSON in under 2s on local sample data.
- GET /api/runs/:id/replay returns usable replay JSON in under 2s on local sample data.
- No write endpoints are introduced.
- No live transport is introduced.

Stop conditions
- If the service layer cannot be imported without the full runtime bootstrapping, stop and produce a decoupling plan instead of pushing forward.

Decoupling sprint (if triggered)
- Scope: extract service classes/modules from `ensemble.py` runtime coupling only
- Target: each service module should be importable with DB path / config arguments only
- Time box: **2–3 days maximum**
- Deliverable: updated `docs/frontend/SERVICE_IMPORT_AUDIT.md` with pass/fail status per module
- Resume rule: after decoupling, restart **BE-1a from scratch** rather than patching around partial assumptions
```

---

## 8. Prompt FE-0 — Contracts and Mappings

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Lock the frontend contracts before building UI surfaces.

Scope
Create or update the frontend contract documents based on actual repo artifacts and BE-1a outputs.

Required deliverables
- docs/frontend/STATE_BOUNDARY.md
- docs/frontend/EVENT_MAPPING.md
- docs/frontend/ROOM_MAPPING.md
- docs/frontend/VIEW_MODEL.md
- docs/frontend/MOCKING_POLICY.md
- docs/frontend/BRIDGE_BOUNDARY.md

Rules
- Use protocol events as canonical only if an actual protocol registry exists.
- If protocol registry files do not exist, derive canonical event categories from the actual SQLite schema and existing service outputs.
- Room mapping must be finalized in this step. Do not defer it to FE-3.
- Frontend view-model names may differ from backend event names, but the mapping must be explicit.

Acceptance criteria
- ROOM_MAPPING.md answers whether Room maps 1:1, 1:N, or some other relation to ensemble constructs.
- EVENT_MAPPING.md clearly separates backend canonical event names from UI projection names.
- MOCKING_POLICY.md states where typed mocks live and when mocks are allowed.
- FE-0 is not done until all unresolved mapping questions are either answered or explicitly blocking.
```

---

## 9. Prompt FE-1 — Application Shell + Run List

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Build the minimal shell that proves the bridge can drive a real UI.

Scope
- App shell
- navigation/frame
- run list screen
- empty/error/loading states
- no live updates

Data source
- BE-1a only
- no fake backend logic beyond typed mocks for absent screens

Constraints
- Read-only UI
- No room composer
- No approval actions
- No graph editor

Acceptance criteria
- Run list loads from GET /api/runs
- Selecting a run navigates to a run detail route or placeholder
- States are typed and driven by actual API responses
- Any temporary mocks live only in the location defined by MOCKING_POLICY.md
```

---

## 10. Prompt FE-2 — Typed Data Layer

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Create a typed client layer for BE-1a outputs.

Scope
- route client functions
- runtime validation / parsing where appropriate
- normalized front-end types
- error handling
- no live transport yet

Constraints
- Do not assume WebSocket.
- Do not assume all endpoints exist; only wire the endpoints actually implemented.
- Keep canonical event names and UI view-model names separated.

Acceptance criteria
- Run list, run detail, replay, state-docs, context-latest all have typed adapters
- Invalid response shapes fail clearly
- There is a clear place to add SSE/WebSocket later without rewriting the base client
```

---

## 11. Prompt FE-3 — Replay / State Docs / Read-only Room

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Build the first actually useful operational screens using read-only data only.

Scope
- replay timeline
- state-docs panel
- context-latest panel
- room timeline if room mapping is settled and endpoint exists

Rules
- transcript is display data only, never execution state
- execution packet or runtime digest must be shown distinctly from room messages
- if room mapping remains blocked, implement replay/state-docs first and leave room behind a feature flag

Acceptance criteria
- A user can inspect a run, see replay events, see state docs, and inspect context digests
- runtime digest and repo digest are labeled by source
- room UI is hidden or disabled unless ROOM_MAPPING.md is settled and the endpoint exists
- If the room surface starts behind a feature flag, remove that flag when **both** are true:
  1. `ROOM_MAPPING.md` is finalized, and
  2. `GET /api/rooms/:id/timeline` returns real backend data
```

---

## 12. Prompt BE-1b — Live Updates + Approvals (optional after BE-1a)

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Add the minimum live/update and approval capabilities needed for the frontend to observe current activity and handle operator approval.

Transport guidance
- Prefer SSE for v0 if the use case is one-way updates.
- Use WebSocket only if true bidirectional room control is already justified by the runtime.

Scope
- live event stream for run/room updates
- approval list/read endpoints
- approval action endpoints (approve/reject/resume as supported by runtime)
- no chat-first transport design

Required tests
- event envelope parse/serialize round-trip tests
- sequence/gap tests only if sequence numbering exists
- approval flow integration smoke

Acceptance criteria
- Live stream works without making the browser a source of truth
- Approval actions round-trip to the runtime correctly
- If SSE is used, reconnection semantics are documented
- If WebSocket is used, justify why SSE was insufficient
```

---

## 13. Prompt FE-4 — Live Room Updates

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Enhance room and replay surfaces with live updates from BE-1b.

Scope
- append live events to existing timeline views
- keep read-only semantics by default
- no room message compose unless runtime actually supports it through the bridge

Constraints
- No hidden transport assumptions
- No reimplementation of execution logic in the browser

Acceptance criteria
- Timeline updates incrementally without losing full replay load capability
- Live events and persisted replay events are visually distinguishable if needed
```

---

## 14. Prompt FE-5 — Graph Inspector

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Add an observability-only graph/state inspector.

Scope
- data-driven nodes and edges from runtime state or service projection
- default labels may include Planner, Router, Worker, Validator, Reflector only if present in actual state
- no graph editing

Acceptance criteria
- The graph is rendered from backend/state data, not hardcoded topology
- Missing graph data degrades gracefully to a textual state panel
```

---

## 15. Prompt FE-6 — Approvals Center

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Add the operator approval center after BE-1b exists.

Scope
- pending approvals list
- approval detail panel
- approve / reject / resume actions if supported
- audit trail display

Rules
- approval UI maps to interrupt/resume semantics, not ad hoc button behavior
- approval actions must reflect actual runtime capabilities

Acceptance criteria
- pending approvals load from real backend data
- approve/reject updates the runtime and the UI reflects the new state
- audit trail is visible for completed approval decisions
```

---

## 16. Prompt FE-7 — Insights View

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Expose insights in a way that is useful for post-run analysis without inventing new backend semantics.

Scope
- decisions
- blockers
- outcomes
- hotspots/risk summaries if actually available

Rules
- Use existing insight extraction outputs first
- Do not fabricate a new insight domain model if the repo already has one

Acceptance criteria
- Insight cards or tables are backed by actual bridge data
- Source references are displayed where available
```

---

## 17. Prompt FE-8 — Stabilization / Test Pyramid / Cleanup

```text
Inspect the repository and write a short implementation plan in PLANS.md before editing files.

Goal
Stabilize the frontend + bridge without broad rewrites.

Required test pyramid
1. Unit tests
   - projection mappers
   - event/view-model mapping helpers
   - envelope parsing if live transport exists
2. Integration tests
   - route client against bridge responses
   - approvals flow adapters
3. E2E smoke tests
   - replay load
   - room streaming or live room update if implemented
   - approve -> resume flow if implemented

Cleanup rules
- Keep diffs scoped
- Remove dead mocks
- Mark v2/v3 frontend plan documents as superseded
- Leave explicit notes for any intentionally deferred features

Acceptance criteria
- Core read-only operator flow is tested
- Optional live/approval flows are tested if present
- Superseded docs are clearly marked
```

---

## 18. What is superseded from older frontend plans

The following assumptions from older plans should be treated as superseded unless revalidated:
- “BE-1 is a thin bridge by default”
- “WebSocket is on the critical path for v0”
- “Room mapping can be postponed until later FE phases”
- “The browser can assume forward stack is already the real runtime”
- “`.conitens/context/LATEST_CONTEXT.md` and `.vibe/context/LATEST_CONTEXT.md` are aliases”
- “Use /plan first” as a generic instruction across all Codex environments

---

## 19. Minimal execution order recommendation

If you want the smallest viable path:
1. P0
2. BE-1a
3. FE-0
4. FE-1
5. FE-2
6. FE-3

Stop there and review before adding BE-1b or later frontend surfaces.

That is the point where you will know whether the bridge is truly lightweight, whether room mapping is coherent, and whether the forward runtime is ready to be the frontend’s target.
