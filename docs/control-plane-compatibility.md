# Control Plane Compatibility Note

This repository currently contains two architectural lineages:

1. The active operations layer built around `scripts/ensemble.py`, `.notes/`, and `.agent/`.
2. The RFC and package lineage centered on `.conitens/`, `packages/*`, and the TypeScript monorepo.

The current branch uses lineage 1 as the operational source of truth.

## Current Rule

- Use `.notes/` for machine state and replayable artifacts.
- Use lowercase extension paths under `.notes/` as canonical for workflows, events, meetings, office, artifacts, handoffs, and gates.
- Keep legacy uppercase aliases readable and writable during the transition.
- Use `.agent/` for workflows, rules, agents, skills, and gate-policy metadata.
- Use `.agents/skills/` only as compatibility discovery for Codex-facing skill documents.

## Reference Surfaces

The following remain reference or parity surfaces for now:

- `packages/*`
- `docs/RFC-1.0.1-merged.md`
- any `.conitens/`-first descriptions in older roadmap material

These surfaces may guide long-term convergence, but they do not override the active Python control plane without a separate ADR.
