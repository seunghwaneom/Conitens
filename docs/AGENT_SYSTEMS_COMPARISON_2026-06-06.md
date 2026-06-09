# Agent Systems -> Conitens Comparative Backlog

Date: `2026-06-06`

This report compares Conitens with Agentland, Maestro, Optio, Agent Squad,
AutoGen, Claw3D, Pixel Agents, and CLI-JAW. It is a planning artifact only:
no product code was changed as part of this pass.

## Baseline

Conitens baseline: `main` at `2c25a9e2aa998fe16edaa83792c52a9db14f2d3c`.
The working tree already included local changes when this research began, so
the comparison should be read as `working tree includes local changes`.

Current Conitens identity is stable: it is an operations layer around external
AI runtimes, not a replacement runtime. It owns state, approvals, verify gates,
event logging, persistent agent definitions, communication records, and
replayable artifacts while Claude, Codex, Gemini, and future runtimes own
reasoning and generation. Local source: `CONITENS.md:3-18`,
`CONITENS.md:61-71`, `README.md:5-18`.

The current expansion rule remains important: new workflow, MCP, office, and
subagent features should extend the Python/Core surface first, and remote or
indirect mutation paths must continue to respect local approval and verify
boundaries. Local source: `docs/adr-0001-control-plane.md:7-24`.

## Source Snapshots

| Project | Snapshot | Primary evidence inspected |
| --- | --- | --- |
| Agentland | `0a57e92c` | README, policy config, event/cost SQL, Rust crates, dashboard manifest |
| Maestro | `575efd0d` | README, architecture/support docs, package manifest, CLI and prompt tree |
| Optio | `9f5abb9d` | README, reconciliation docs, persistent-agent docs, task docs, API manifests |
| Agent Squad | `db10bf56` | README, Python/TypeScript source trees, examples; `awslabs/agent-squad` now redirects to `2FastLabs/agent-squad` |
| AutoGen | `027ecf0a` | README, security file, Python packages, .NET source |
| Claw3D | `eeb6f31` | README, architecture/security docs, multi-agent beta docs, source/server trees |
| Pixel Agents | `17ad25d` | README, core adapter source, VS Code adapter, webview UI, asset docs |
| CLI-JAW | `358c851` | README, localized READMEs, package manifest, docs, core and Electron source |

## Executive Findings

1. **Adopt Agentland-style observability, but not its full proxy stack yet.**
   Conitens already has append-only events and replay, but it lacks provider
   traffic fields for cost, latency, model, token, PII, and compliance rollups.
   Agentland's strongest idea is its provider-adjacent telemetry schema and
   policy layer, not necessarily the full Timescale/Rust reverse proxy.

2. **Adapt Optio's reconciler into Conitens' forward task model.** Conitens has
   validator/retry/approval discipline, but Optio's pure decision plus
   compare-and-swap executor and periodic resync model is a concrete fix for
   stuck task/PR/workflow states.

3. **Borrow Maestro and CLI-JAW operator ergonomics.** Conitens has background
   sessions, dashboard routes, and task surfaces, but it is weaker in
   multi-CLI runtime status, keyboard-first session handling, install doctor
   evidence, worktree orchestration, and user-facing automation loops.

4. **Treat Agent Squad and AutoGen as design references, not dependencies.**
   Both are runtime frameworks for routing and multi-agent composition. Conitens
   should encode compatible supervisor/router patterns as workflow contracts and
   prompt surfaces rather than adding another orchestration runtime.

5. **Spatial UI investment should become diagnostic and operational, not only
   ambient.** Claw3D and Pixel Agents show stronger live presence, layout
   editing, transcript-driven status, and backend-neutral provider seams.
   Conitens already has Pixel Office and an optional 3D command center, so the
   gap is interaction depth and signal reliability.

## Feature Gap Matrix

| Axis | External evidence | Conitens status | Decision | Recommended change |
| --- | --- | --- | --- | --- |
| Provider traffic observability | Agentland captures model, token, cost, latency, tools, PII, lineage hash, and compliance tags in its event table. Sources: [README](https://github.com/jaiswal-naman/agentland/blob/0a57e92cff793ac81d77cbf494cdea44bbc4fee8/README.md#L56-L68), [events SQL](https://github.com/jaiswal-naman/agentland/blob/0a57e92cff793ac81d77cbf494cdea44bbc4fee8/init/001_create_events.sql#L1-L64). | Partial. Conitens has append-only events and replay but no first-class provider-call telemetry schema. Local: `CONITENS.md:154-160`, `README.md:135-151`. | Adopt | Add a provider-call event contract with optional cost/latency/token/PII fields; start as event/projection data, not a proxy rewrite. |
| Cost and budget rollups | Agentland rolls cost by day, agent, model, protocol, token totals, and latency percentiles. Source: [cost SQL](https://github.com/jaiswal-naman/agentland/blob/0a57e92cff793ac81d77cbf494cdea44bbc4fee8/init/003_create_costs.sql#L1-L32). Maestro also exposes real-time token/cost tracking. Source: [README](https://github.com/RunMaestro/Maestro/blob/575efd0dccc7076c5df035813627cc0445e72d54/README.md#L45-L63). | Partial. Conitens has token compression and task evidence, but not spend attribution by runtime/model/task. Local: `README.md:128-151`. | Adopt | Add read-only cost summary projections keyed by run, task, agent, provider, and model before any enforcement. |
| Policy engine | Agentland supports YAML allow/block/alert rules over provider, agent, model, direction, tokens, and cost. Source: [policy example](https://github.com/jaiswal-naman/agentland/blob/0a57e92cff793ac81d77cbf494cdea44bbc4fee8/config/policies.example.yaml#L1-L30). | Partial. Conitens has approval and gate policy surfaces, but no traffic-policy evaluator. Local: `CONITENS.md:95-120`, `CONITENS.md:182-193`. | Adapt | Add a dry-run policy evaluator over existing events first. Enforcement must route through existing approval/verify gates. |
| Task/PR feedback loop | Optio turns tasks into PRs, monitors CI/review state, resumes agents on failures or review feedback, and merges on green conditions. Source: [README](https://github.com/jonwiggins/optio/blob/9f5abb9de7f7bc07beeff8b79939505798ac1ed3/README.md#L8-L19), [task flow](https://github.com/jonwiggins/optio/blob/9f5abb9de7f7bc07beeff8b79939505798ac1ed3/README.md#L57-L77). | Partial. Conitens has operator tasks, linked evidence, approvals, and guarded deletion/update, but no PR/CI watcher loop. Local: `README.md:102-151`, `scripts/ensemble_forward_bridge.py` task/approval paths. | Adapt | Add GitHub PR/CI evidence ingestion and human-approved resume suggestions before any auto-merge path. |
| Reconciliation loop | Optio centralizes state transitions in pure decisions, uses CAS, resyncs periodically, and records decision telemetry. Source: [reconciliation docs](https://github.com/jonwiggins/optio/blob/9f5abb9de7f7bc07beeff8b79939505798ac1ed3/docs/reconciliation.md#L1-L49), [state machines](https://github.com/jonwiggins/optio/blob/9f5abb9de7f7bc07beeff8b79939505798ac1ed3/docs/reconciliation.md#L50-L93). | Partial. Conitens has a forward execution loop and validator owner, but remaining risks include dual control planes and live-projection ambiguity. Local: `docs/current-architecture-status-ko.md:106-133`, `docs/current-architecture-status-ko.md:269-304`. | Adopt | Introduce `operator_task_reconciler` as a pure decision module over current SQLite state, with no new runtime owner claim. |
| Persistent agent service model | Optio distinguishes run identity from long-lived agent identity, with wake sources, lifecycle modes, inbox messages, and per-turn records. Source: [persistent agents](https://github.com/jonwiggins/optio/blob/9f5abb9de7f7bc07beeff8b79939505798ac1ed3/docs/persistent-agents.md#L1-L39), [wake/API/schema](https://github.com/jonwiggins/optio/blob/9f5abb9de7f7bc07beeff8b79939505798ac1ed3/docs/persistent-agents.md#L79-L174). | Partial. Conitens has persistent agent definitions and communication threads, but the live service/turn lifecycle remains underdeveloped. Local: `README.md:20-32`, `README.md:113-151`. | Adapt | Add wake-source metadata and per-turn records to persistent agents, keeping actual execution behind existing background/session adapters. |
| Intent routing and supervisor teams | Agent Squad routes queries using classifier, characteristics, and conversation history; it also has a SupervisorAgent for parallel specialized teams. Source: [README](https://github.com/2FastLabs/agent-squad/blob/db10bf56aafcca4f04806be8e06c4d02eb4da2da/README.md#L40-L57), [supervisor section](https://github.com/2FastLabs/agent-squad/blob/db10bf56aafcca4f04806be8e06c4d02eb4da2da/README.md#L75-L100). AutoGen shows agent-as-tool orchestration. Source: [README](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/README.md#L104-L154). | Partial. Conitens has workflow contracts, room/replay, handoffs, and skill metadata, but not a first-class classifier/router contract. Local: `CONITENS.md:195-211`, `docs/current-architecture-status-ko.md:206-224`. | Adapt | Add a router workflow contract that classifies task intent to agent/workflow candidates and records the routing decision as evidence. Do not embed Agent Squad or AutoGen as a runtime dependency. |
| Runtime framework dependency | AutoGen is now in maintenance mode and directs new users to Microsoft Agent Framework. Source: [AutoGen README](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/README.md#L14-L25), [status guidance](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/README.md#L177-L218). | Intentionally excluded. Conitens' stated role is not runtime replacement. Local: `CONITENS.md:3-18`. | Avoid | Do not add AutoGen as a core dependency. Keep compatibility at workflow/prompt/interface level. |
| Multi-CLI desktop/session operations | Maestro supports Claude Code, Codex, OpenCode, Factory Droid, worktrees, Auto Run/playbooks, group chat, mobile remote control, CLI mode, session discovery, queueing, and cost tracking. Source: [README](https://github.com/RunMaestro/Maestro/blob/575efd0dccc7076c5df035813627cc0445e72d54/README.md#L11-L18), [features](https://github.com/RunMaestro/Maestro/blob/575efd0dccc7076c5df035813627cc0445e72d54/README.md#L33-L63). | Partial. Conitens has background CLI sessions and dashboard, but not the same interactive session manager or mobile/remote control. Local: `README.md:122-151`. | Adapt | Add runtime/session roster and worktree-aware execution metadata to dashboard and CLI before remote control. |
| Install/doctor/release evidence | CLI-JAW emphasizes safe install paths, WSL support, fresh-machine evidence collection, `jaw doctor`, runtime status, and release evidence gates. Source: [README](https://github.com/lidge-jun/cli-jaw/blob/358c8511aa254d5dd0ce055f570f4e953f6d9ab8/README.md#L18-L41), [fresh evidence](https://github.com/lidge-jun/cli-jaw/blob/358c8511aa254d5dd0ce055f570f4e953f6d9ab8/README.md#L80-L147), [doctor](https://github.com/lidge-jun/cli-jaw/blob/358c8511aa254d5dd0ce055f570f4e953f6d9ab8/README.md#L198-L218). | Partial. `.vibe` has doctor/quality gates, but Conitens packaging evidence is less operator-facing. Local: `docs/current-architecture-status-ko.md:70-87`. | Adopt | Add a Conitens release/install evidence checklist and `ensemble doctor --evidence` artifact flow. |
| Structured orchestration phases | CLI-JAW's PABCD gates phase transitions and persists state across restarts. Source: [README](https://github.com/lidge-jun/cli-jaw/blob/358c8511aa254d5dd0ce055f570f4e953f6d9ab8/README.md#L362-L379). | Already strong. Conitens has verify-before-close, workflow contracts, approval gates, and forward loop retry/escalation. Local: `CONITENS.md:172-211`, `docs/current-architecture-status-ko.md:163-189`. | Adapt lightly | Rename or surface existing Conitens phases more clearly in operator UI; do not create another orchestration mode. |
| Spatial/live office UI | Claw3D provides a live 3D office, builder, runtime seam, WebSocket proxy, approvals/history/activity surfaces, and backend-neutral provider expectations. Source: [README](https://github.com/iamlukethedev/Claw3D/blob/eeb6f31f06c6c9a9f32bf359339fe547d5b92c47/README.md#L19-L59), [runtime seam](https://github.com/iamlukethedev/Claw3D/blob/eeb6f31f06c6c9a9f32bf359339fe547d5b92c47/README.md#L117-L148), [security/config](https://github.com/iamlukethedev/Claw3D/blob/eeb6f31f06c6c9a9f32bf359339fe547d5b92c47/README.md#L187-L258). | Partial. Conitens has Pixel Office and optional 3D Command Center, but office metaphor is currently maintained and deprioritized. Local: `README.md:52-80`, `README.md:30-32`. | Defer/adapt | Use Claw3D mainly to improve runtime seams, office builder safety, and visual diagnostics; do not shift product center back to spatial UI. |
| Transcript-driven pixel presence | Pixel Agents observes Claude Code JSONL transcripts, maps tool usage to character state, supports layout editor/assets, and visualizes subagents. Source: [README](https://github.com/pixel-agents-hq/pixel-agents/blob/17ad25ddbfad3392628a2d91b5303335cc5c4923/README.md#L27-L45), [how it works](https://github.com/pixel-agents-hq/pixel-agents/blob/17ad25ddbfad3392628a2d91b5303335cc5c4923/README.md#L105-L119). | Partial. Conitens has office avatars and replay, but live status quality and transcript sync remain thinner. Local: `README.md:56-74`. | Adapt | Add an event/transcript watcher contract for status derivation and expose confidence/debug info when status is heuristic. |
| Unsafe permission bypass | Pixel Agents documents a launch option that bypasses Claude tool approval prompts. Source: [README](https://github.com/pixel-agents-hq/pixel-agents/blob/17ad25ddbfad3392628a2d91b5303335cc5c4923/README.md#L73-L80). | Intentionally excluded. Conitens must preserve approval and verify gates. Local: `CONITENS.md:182-193`. | Avoid | Do not add skip-permission launch affordances to Conitens UI. |

## Prioritized Backlog

### P0: Evidence and Safety

1. **Provider-call telemetry event contract**
   - Add event fields for provider, model, token counts, cost, latency, tool
     calls, and optional PII findings.
   - Projection-only first: dashboard summaries and reports should read from
     existing event/replay layers.
   - Do not build a reverse proxy in the first slice.

2. **Operator task reconciler**
   - Add a pure decision module over current operator task, approval, run,
     validation, and room evidence state.
   - Include compare-and-swap style stale-state protection where current SQLite
     repository APIs allow it.
   - Add periodic resync as a safe repair path for stuck tasks.

3. **Install/doctor evidence mode**
   - Extend existing `.vibe`/doctor posture into a user-facing Conitens command
     that records environment, CLI availability, PATH, versions, auth status,
     and verification logs.
   - Output an artifact suitable for release or support triage.

### P1: Operator Workbench

4. **Runtime/session roster**
   - Add a read-only roster of configured external runtimes and recent session
     health: Codex, Claude, Gemini, OpenCode, and any configured provider.
   - Keep auth-sensitive data out of browser storage.

5. **PR/CI evidence ingestion**
   - Add GitHub/CI read ingestion into task detail evidence.
   - First deliverable should suggest resumes and fixes; auto-merge remains
     out of scope until a later approval policy exists.

6. **Persistent-agent wake model**
   - Add explicit wake sources, per-turn records, and inbox state to persistent
     agents.
   - Keep agent execution behind current background/session adapters.

7. **Router workflow contract**
   - Add a classifier/router workflow that records why a task was routed to a
     role, room, or workflow.
   - Use existing `.agent/workflows` and `.notes` event projections.

### P2: Spatial and Interaction Polish

8. **Status-confidence and transcript watcher**
   - Add a status derivation layer with evidence refs and confidence.
   - Surface debug state when office avatar status is heuristic or stale.

9. **Office layout import/export**
   - Borrow the asset-manifest and layout-editor idea from Pixel Agents and
     Claw3D, but keep it secondary to operator workbench flows.

10. **Keyboard-first command surface**
   - Add Maestro/CLI-JAW style quick actions for run/task/agent switching,
     approval review, and evidence search.

## Fixes and Guardrails

- **Do not introduce another runtime owner.** AutoGen and Agent Squad patterns
  should be translated into Conitens workflow contracts, not embedded as new
  orchestration cores.
- **Do not weaken approval.** Remote, web, MCP, and spatial UI write paths must
  route through existing approval/verify mechanisms.
- **Resolve stale context risk before deep UI expansion.** Local architecture
  docs already identify `.vibe/context/LATEST_CONTEXT.md` stale risk and
  checked-in runtime/context artifact ambiguity. Source:
  `docs/current-architecture-status-ko.md:269-304`.
- **Treat cost/PII telemetry as sensitive.** New event fields should support
  redaction and projection controls before dashboards expose details.
- **Keep worktree/PR automation opt-in.** Maestro/Optio show the value of
  parallel worktrees and PR loops, but Conitens should add evidence and
  approval-led control before unattended merge behavior.

## Non-Adoptions

- No new AutoGen dependency.
- No Agent Squad runtime embedding.
- No full Agentland reverse proxy in the first slice.
- No Kubernetes requirement from Optio.
- No approval-bypass launch controls.
- No migration of active runtime truth away from `scripts/ensemble.py` +
  `.notes/` + `.agent/` without a later ADR.

## Acceptance for This Research Pass

- All eight external repositories have pinned commits and inspected primary
  source files.
- Every major recommendation maps to a source-backed external capability and a
  Conitens current-state reference.
- The backlog preserves Conitens' event-first, approval-gated, replayable
  operations-control-plane identity.
