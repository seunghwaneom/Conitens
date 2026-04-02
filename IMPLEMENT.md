# IMPLEMENT.md

## Purpose

Future Conitens agent runs use this repo as a disk-backed, restartable v0
system. A fresh execution context must be able to resume from files under
`.conitens/` plus the current runtime docs, not from hidden prompt state.

## Runbook Skeleton

1. Read `AGENTS.md` and `.conitens/context/LATEST_CONTEXT.md`.
2. Confirm whether the task targets current runtime truth
   (`scripts/ensemble.py` + `.notes/` + `.agent/`) or forward Batch 0 contract
   surfaces under `.conitens/`.
3. Update `.conitens/context/task_plan.md` before substantial changes.
4. Append only verified findings to `.conitens/context/findings.md`.
5. Append meaningful step outcomes to `.conitens/context/progress.md`.
6. Refresh `.conitens/context/LATEST_CONTEXT.md` before handoff or stop.
7. Record stop conditions through the loop protocol and leave replayable
   artifacts, not transcript dumps.

## Prompt And Memory Rules

- Worker prompts consume compact summaries, decisions, and artifact paths.
- Full room or worker transcript stuffing is prohibited.
- Persona identity core is read-only unless the user explicitly requests an
  identity update.

## Verified Repo Scan

- Stack: pnpm workspace monorepo with Node.js/TypeScript packages and Vite UIs,
  plus a Python CLI runtime entry.
- Package manager: `pnpm@9.15.0` from root `package.json`.
- Workspace layout: `packages/command-center`, `packages/core`,
  `packages/dashboard`, `packages/protocol`, `packages/tui`.
- Root scripts: `pnpm build` and `pnpm test`.
- Verified test commands:
  - root: `pnpm test`
  - `@conitens/command-center`: `pnpm --filter @conitens/command-center test`
  - `@conitens/dashboard`: `pnpm --filter @conitens/dashboard test`
  - `@conitens/core`: `pnpm --filter @conitens/core test`
  - `@conitens/protocol`: `pnpm --filter @conitens/protocol test`
- Verified typecheck commands:
  - `pnpm --filter @conitens/command-center typecheck`
  - `pnpm --filter @conitens/command-center typecheck:test`
  - `pnpm --filter @conitens/command-center typecheck:electron`
  - other TypeScript packages currently typecheck through `build` scripts that
    invoke `tsc`
- Lint commands: no dedicated root or package-level lint script was found in
  the current package manifests.
- UI entry points:
  - dashboard web app: `packages/dashboard/src/main.tsx`
  - command-center web app: `packages/command-center/src/main.tsx`
  - command-center electron shell: `packages/command-center/electron/main.ts`
- Backend and CLI entry points:
  - CLI wrapper: `bin/ensemble.js`
  - Python runtime: `scripts/ensemble.py`
  - core library export surface: `packages/core/src/index.ts`
- TUI entry point:
  - source export surface: `packages/tui/src/index.ts`
  - note: the current `packages/tui/package.json` dev script still references
    `src/index.tsx`, so the manifest and source file name are not aligned

## Placement Guidance

- Future loop protocol and replay code belongs under `.conitens/loops/` and
  `.conitens/runtime/`.
- Future repo-intelligence and gate helpers belong under `.vibe/`.
- Future persona and identity-adjacent files belong under `.conitens/personas/`.
- Future progressive-disclosure skills belong under `.agents/skills/`.
