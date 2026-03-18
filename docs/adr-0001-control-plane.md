# ADR-0001: Current Control-Plane Truth

## Status

Accepted

## Decision

Conitens' active control plane for the current product line is the Python `ensemble` operations layer plus `.notes/` and `.agent/`.

- Runtime truth: `.notes/`
- Canonical configuration: `.agent/`
- Compatibility skills: `.agents/skills/`
- Compatibility/runtime support: `.vibe/`
- Additive implementation surface: `scripts/ensemble.py` + `scripts/ensemble_*.py`
- Lowercase extension paths under `.notes/` are canonical for new workflow/event/meeting/office/artifact/handoff/gate records, with legacy uppercase aliases preserved during the transition.

The TypeScript monorepo and RFC-era `.conitens/` model remain important reference/parity surfaces, but they are not the active runtime truth for this branch of the repository unless a later ADR promotes them.

## Consequences

- New workflow, MCP, office, and subagent features extend the Python/Core surface first.
- Remote or indirect mutation paths must continue to respect local approval and verify boundaries.
- Documentation must not describe `.context/` or `.conitens/` as the active runtime model for the current product line.
- Any future convergence back toward the TypeScript monorepo must happen explicitly through a later ADR.
