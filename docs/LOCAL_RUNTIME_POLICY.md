# Local Runtime Policy

This document defines what should stay local-only in `D:\Google\.Conitens` and
what should be synchronized with `main`.

## Track In Git

- source files under `scripts/`, `packages/`, `tests/`, `.agent/`, `.agents/`, `.vibe/`
- canonical docs under `docs/`
- top-level project metadata and configuration

## Keep Local-Only

- `.notes/`
- `.omx/`
- `.omc/`
- `node_modules/`
- `packages/*/node_modules/`

These directories are useful workspace/runtime state or dependency caches and
should not be deleted during routine sync unless the user explicitly wants a
hard reset.

## Safe Cleanup Targets

- `packages/*/dist/`
- `scripts/__pycache__/`
- `tests/__pycache__/`
- transient docs state such as `docs/.bkit-memory.json` and `docs/.pdca-status.json`

## Smart Sync Rule

When syncing local `main` with `origin/main`:

1. keep tracked source/doc files aligned with Git
2. prune merged branches
3. remove disposable generated artifacts when possible
4. preserve runtime state and dependency caches unless a hard cleanup is requested

## Windows Note

Some generated directories may remain as empty folders because Windows file
locks can block directory removal after build/test commands. That is acceptable
as long as Git status is clean and the folders are ignored.
