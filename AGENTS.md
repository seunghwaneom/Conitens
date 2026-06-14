# AGENTS.md - Conitens Repo Contract

Read `.conitens/context/LATEST_CONTEXT.md` before any substantial work. Also
read `.vibe/context/LATEST_CONTEXT.md` when repo intelligence is relevant. If the
task meaningfully changes, update `.conitens/context/task_plan.md`,
`.conitens/context/findings.md`, `.conitens/context/progress.md`, and
`.conitens/context/LATEST_CONTEXT.md` in the same change set.

## Operating Rules

- Current runtime truth for the existing Conitens product line remains
  `scripts/ensemble.py` + `.notes/` + `.agent/`.
- `events/*.jsonl` is the sole commit point (I-1). All state mutations must
  emit events via `append_event()` before writing files.
- `.notes/` files are **projections** from events, regenerable via
  `ensemble_obsidian.py rebuild` (I-2). Do not write to `.notes/` directly
  from new modules — emit events and let the projection layer handle it.
- `.conitens/` is the forward contract surface for Ralph-aware,
  restartable, disk-backed loop work. Do not claim it replaces the current
  runtime until a later batch explicitly does so.
- Extend the Python core additively through `scripts/ensemble_*.py`. Do not
  replace `scripts/ensemble.py`.
- `.agent/` is the canonical config surface. `.agents/skills/` is the
  progressive-disclosure compatibility surface. `.vibe/` is the sidecar for
  repo intelligence, gates, and fast-lane tooling.
- Keep diffs scoped, local, and reversible. No repo-wide formatting or cleanup
  sweeps.
- Preserve approval and verify gates. Do not create a close path that bypasses
  verification by default.
- Prefer append-only, replayable artifacts over prose-only summaries.
- Do not stuff full room or worker transcripts into prompts. Pass compact
  summaries, decisions, and artifact paths instead.
- Do not auto-edit persona identity core. Identity or persona-core changes
  require explicit user direction.
- Prefer one task per iteration unless the current batch explicitly groups work.
- No vector DB or embeddings in v0.
- LangGraph is reserved for the orchestration core.
- AG2 is reserved for user-visible room, debate, and review episodes.

## Working Defaults

- Record verified facts before writing architecture docs.
- Reuse existing `.notes`, `.agent`, and `.vibe` semantics before inventing new
  state shapes.
- Prefer machine-readable artifacts and explicit file placement over narrative
  handoffs.
- When docs disagree, prefer `CONITENS.md` and
  `docs/adr-0001-control-plane.md` for current runtime behavior.

## Conitens UI Architecture Rules

### Spatial Lens

Focused mode is not Floor Overview.

Focused mode must answer these operator questions in under 3 seconds:

1. Who is active?
2. What is blocked?
3. Who owns the next handoff?
4. What should the operator do next?

In Focused mode:

- The Active Handoff Workbench is the primary visual surface.
- The pixel floor map is secondary context only.
- Do not place critical task cards on top of visually noisy pixel art.
- Hide minimap unless the user is in Floor Overview.
- Do not duplicate the same phase state in multiple competing components.
- Blocked task and next operator action must be explicit text, not just sprite
  position.
- Floor Overview owns the full spatial map.
- Classic owns dense dashboard/table views.

Preferred Focused hierarchy:

1. Compact posture metrics.
2. Active handoff chain.
3. Muted spatial context.

Required handoff semantics:

- PLAN / architect / Ops Control / running
- BUILD / worker-1 / idle
- VALIDATE / sentinel / Validation Office / review
- APPROVE / owner / owner gate / blocked

When changing UI:

- Prefer structural hierarchy changes over cosmetic tweaks.
- Keep top nav on one row at 1220px width.
- Avoid new dependencies unless justified.
- Preserve existing demo data shape where possible.
