# ADR-0003: LangGraph Direct Integration Is Deferred

## Status

Accepted

## Decision

Batch 8 does **not** add a direct LangGraph dependency yet.

Instead, Conitens ships a local orchestration interface and state schema in
Python that preserves:

- planner/build loop separation
- checkpoint/resume behavior
- one-task-per-iteration enforcement
- a future adapter point for LangGraph

## Why

- `langgraph` is not installed in the current Python surface.
- The repo still has no declared Python dependency manager
  (`pyproject.toml`, `requirements.txt`, `setup.py`, etc.).
- Adding LangGraph directly in this batch would invent a new dependency
  boundary first, which is architectural sprawl relative to the existing
  additive `scripts/ensemble_*.py` model.

## Consequences

- Batch 8 uses a local orchestration skeleton in `scripts/ensemble_orchestration.py`.
- Persistent checkpoints are stored in the existing loop SQLite database.
- LangGraph remains the preferred future runtime once the repo has a clean,
  declared Python dependency boundary.
