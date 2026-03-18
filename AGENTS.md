# AGENTS.md - Conitens Codex Guide

Conitens is an orchestration and operations layer. It does not replace external
agent runtimes; it coordinates them through state, approvals, verification,
meetings, workflows, events, and replayable artifacts.

## Role

- Codex acts as `Architect & Sentinel` first.
- Prefer structural integrity, explicit contracts, and verifiable outcomes over
  fast feature growth.
- Generated canonical state is the source of truth. Agent prose is secondary.

## Extension Rules

- Preserve the existing Core in `scripts/ensemble.py` and extend through
  additive modules in `scripts/ensemble_*.py`.
- Reuse existing `.notes`, `.agent`, `.vibe`, verify, question, and lock
  semantics before inventing new state.
- Keep diffs small and local. Avoid repo-wide formatting, cleanup sweeps, or
  bulk JSDoc generation.
- Prefer stdlib Python. Any new non-stdlib dependency must be optional and
  isolated.

## Safety Rules

- Never create a close path that bypasses `verify` by default.
- Any MCP, Telegram, or hook path that can write or execute must preserve the
  existing question gate or owner approval policy.
- Remote channels must not directly mutate workspace files without a local
  approval gate.
- Sensitive data must pass through shared redaction before it is logged,
  summarized, mirrored, or transmitted.

## Validation Rules

- Favor staged-only checks for local hooks and quick loops.
- Keep whole-repo or deep scans behind explicit commands.
- When extending workflows, record step results and run metadata so execution is
  replayable.
- Prefer machine-readable artifacts in `.notes/` over narrative-only summaries.

## Directory Contracts

- `.agent/` is the canonical Conitens config surface for rules, workflows, agents, skills, and gate policies.
- `.agents/skills/` is the Codex compatibility layer for skill discovery.
- `.notes/` stores operational state, events, meetings, reports, and context.
- `.vibe/` is preserved for version/context compatibility and must not be
  removed.

## Control Plane Precedence

- Current active runtime truth is `scripts/ensemble.py` plus `.notes/` and `.agent/`.
- Lowercase extension paths under `.notes/` are canonical for new control-plane artifacts, with legacy uppercase aliases kept during the transition.
- `packages/*`, RFC-era `.conitens` material, and older roadmap documents are reference/parity surfaces unless a later ADR explicitly promotes them.
- When docs disagree, prefer [docs/adr-0001-control-plane.md](docs/adr-0001-control-plane.md) and [CONITENS.md](CONITENS.md) for current behavior.

## Expected Behaviors

- Read the repository structure and existing command flow before implementing.
- Keep workflow definitions versioned with `schema_v`.
- Ignore unknown contract fields with warnings instead of hard failure unless
  safety is at risk.
- Prefer append-only logs for events and meeting transcripts.

## Review Focus

- Verify-before-close integrity
- Approval and ownership boundaries
- Append-only event integrity
- Redaction coverage
- Packaging and documentation consistency
