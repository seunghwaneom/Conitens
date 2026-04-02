# ADR-0002: LangGraph Direct Adoption Blocker

## Status

Accepted

## Context

Batch 8 needs planner/build orchestration skeletons with checkpointing and
resume behavior.

The current repo:

- uses additive Python orchestration modules under `scripts/`
- persists loop state in SQLite without a Python package manager
- does not currently have `langgraph` or `langchain_core` installed
- does not declare Python dependencies in `pyproject.toml`,
  `requirements.txt`, or an equivalent lock-managed surface

## Decision

Do **not** adopt LangGraph directly in Batch 8.

Instead, implement:

- local `PlannerGraph` and `BuildGraph` interfaces
- a SQLite-backed checkpointer on the existing loop DB
- thin orchestration node stubs
- a swap-in boundary so LangGraph can replace the local interfaces later

## Exact Blocker

Adding LangGraph directly would require creating a new Python dependency
boundary first. Doing that in Batch 8 would be architectural sprawl relative to
the current repo shape and would violate the batch constraint to avoid forcing a
cross-stack rewrite.

## Consequences

- Batch 8 still gets planner/build separation, checkpointing, resume, retry
  persistence, and testable interfaces.
- A later batch can adopt LangGraph behind the existing local graph interfaces
  once the repo has an explicit Python dependency surface.
