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

## Figma Design System Rules

These rules apply when implementing or refining Figma-driven UI for this repo,
especially `packages/dashboard` and the pixel-office surfaces.

### Component organization

- Dashboard UI components live in `packages/dashboard/src/components/`.
- Pixel-office-specific structure lives in:
  - `packages/dashboard/src/components/Office*.tsx`
  - `packages/dashboard/src/office-*.ts`
  - `packages/dashboard/src/office*.module.css`
- Reuse existing room, resident, and task projection helpers before adding new
  presentation logic:
  - `packages/dashboard/src/dashboard-model.ts`
  - `packages/dashboard/src/office-presence-model.ts`
  - `packages/dashboard/src/office-stage-schema.ts`
  - `packages/dashboard/src/office-system.ts`

### Styling and tokens

- Use the existing styling stack: global tokens in
  `packages/dashboard/src/styles.css` plus CSS Modules for feature surfaces.
- IMPORTANT: Reuse CSS variables from `styles.css` for color, typography, and
  state tones; do not hardcode new palette values unless the token set is first
  updated.
- Office-specific layout and room styling belongs in:
  - `office.module.css`
  - `office-stage.module.css`
  - `office-sidebar.module.css`
- Keep pixel styling flat and card-light; whitespace, grid structure, and token
  contrast should do more work than shadows or gradients.

### Assets and iconography

- Pixel-office assets are stored in `packages/dashboard/public/`.
- IMPORTANT: Reuse the shipped PNG tile/sprite assets (`office-floor-*.png`,
  `office-door-*.png`, `office-fixtures.png`) instead of adding new icon
  packages.
- If Figma or MCP output provides asset URLs, map them into
  `packages/dashboard/public/` only when the current asset set cannot represent
  the design.

### Figma-to-code flow

1. Run `get_design_context` for the exact node.
2. Run `get_screenshot` for visual parity.
3. Translate the result into this repo's conventions rather than copying raw
   generated markup verbatim.
4. Reuse existing dashboard components and CSS-module structure where possible.
5. Keep room semantics and data wiring in the model layer; presentation changes
   belong in the component / CSS layer.
6. Validate the rendered result against the Figma/reference screenshot and the
   local build.

### Project-specific implementation rules

- React + TypeScript + Vite are the dashboard implementation baseline.
- Preserve current event/task/agent contracts from
  `packages/dashboard/src/store/event-store.ts` and related model helpers unless
  the task explicitly includes model changes.
- Prefer compact operator UI copy over marketing copy.
- Keep Office tab hierarchy stage-first with a narrow context rail; do not
  reintroduce heavy dossier/card systems unless explicitly requested.
- New office interactions must degrade gracefully in demo mode when the
  websocket is disconnected.
