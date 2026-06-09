# Agent Systems Comparative Review

Date: `2026-06-06`

This repo-scoped review mirrors the conclusions in
`docs/AGENT_SYSTEMS_COMPARISON_2026-06-06.md`.

## Conclusion

Conitens should not copy any of the compared projects wholesale. The strongest
path is selective translation:

1. **Adopt Agentland's telemetry shape** for provider-call events, cost,
   latency, PII, policy, and compliance rollups, but start as Conitens
   event/projection data rather than a reverse-proxy rewrite.
2. **Adapt Optio's reconciler** into a pure-decision repair loop for operator
   tasks, approvals, validation, and PR/CI evidence.
3. **Borrow Maestro and CLI-JAW ergonomics** for multi-CLI runtime status,
   worktree-aware sessions, install/doctor evidence, keyboard-first navigation,
   and operator-visible automation phases.
4. **Use Agent Squad and AutoGen as pattern references only.** Router,
   supervisor, and agent-as-tool patterns belong in Conitens workflow contracts,
   not as new runtime dependencies.
5. **Improve spatial UI as diagnostics, not as the product center.** Claw3D
   and Pixel Agents are most useful for runtime seams, transcript-driven status,
   layout/asset mechanics, and confidence/debug surfacing.

## Snapshot Evidence

| Project | Commit | Conitens decision |
| --- | --- | --- |
| Agentland | `0a57e92c` | Adopt telemetry schema and policy ideas; defer reverse proxy |
| Maestro | `575efd0d` | Adapt session/worktree/keyboard/operator UX |
| Optio | `9f5abb9d` | Adopt reconciler pattern; adapt PR/CI loops |
| Agent Squad | `db10bf56` | Adapt router/supervisor contracts; avoid dependency |
| AutoGen | `027ecf0a` | Avoid core dependency because project is maintenance-mode; borrow patterns only |
| Claw3D | `eeb6f31` | Adapt runtime seam and spatial diagnostics |
| Pixel Agents | `17ad25d` | Adapt transcript/status/layout ideas; avoid approval bypass |
| CLI-JAW | `358c851` | Adopt install/doctor evidence and runtime dashboard ideas |

## Backlog

### P0

- Add provider-call telemetry events and read-only cost/latency/token/PII
  projections.
- Add an operator task reconciler with pure decisions, stale-state protection,
  and periodic resync.
- Add `ensemble doctor --evidence` style environment and install evidence
  artifacts.

### P1

- Add read-only runtime/session roster for external CLI providers.
- Add PR/CI evidence ingestion to task detail and approval workflows.
- Add persistent-agent wake sources and per-turn records.
- Add a router workflow contract that records routing decisions as evidence.

### P2

- Add status-confidence/debug fields for office avatars and transcript-derived
  activity.
- Add office layout import/export and asset-manifest support.
- Add keyboard-first quick actions for tasks, runs, approvals, and evidence
  search.

## Guardrails

- Keep active runtime truth at `scripts/ensemble.py` + `.notes/` + `.agent/`
  unless a later ADR changes it.
- Do not introduce AutoGen, Agent Squad, Kubernetes, or a provider proxy as a
  required core dependency.
- Do not add UI or CLI controls that bypass approval or verify gates.
- Treat cost and PII telemetry as sensitive data with redaction/projection
  controls.
