---
name: "Conitens Ensemble Protocol"
description: "Core operational rules for Conitens as an agentic engineering operations layer."
trigger: always_on
schema_v: 1
---

# Conitens Protocol

- Treat `task.md` and machine-generated state in `.notes/` as the canonical source of truth.
- Extend the existing Core through additive modules; do not replace `scripts/ensemble.py`.
- Keep `verify` mandatory before `close` for code changes.
- Use question-gate or owner approval for write/execute paths exposed through hooks, MCP, or Telegram.
- Preserve append-only logs for events and meetings whenever possible.
- Prefer small, reversible diffs and staged-first validation loops.
- Treat `.agent/agents/`, `.agent/skills/`, and `.agent/policies/` as canonical control-plane metadata surfaces.
- Treat lowercase `.notes` extension paths as canonical for workflows/events/meetings/office/artifacts/handoffs/gates while keeping legacy uppercase aliases readable during the transition.
- Treat `packages/*` and RFC-era `.conitens` material as reference/parity surfaces unless a later ADR promotes them.

# Directory Roles

- `.agent/workflows/`: canonical Conitens workflow contracts
- `.agent/agents/`: canonical agent registry
- `.agent/skills/`: canonical skill registry
- `.agent/policies/`: gate policy metadata
- `.agents/skills/`: Codex compatibility skills
- `.notes/`: runtime state, events, meetings, office reports, context
- `.vibe/`: version/context compatibility surface
