# LOOP_PROTOCOL.md

## Purpose

This protocol defines the disk-backed loop vocabulary for future Ralph-aware execution. Every iteration must be restartable from disk with a fresh execution context.

## Definitions

- `run`: the top-level attempt to complete one task or batch. A run is persisted on disk and remains resumable after process exit or crash.
- `iteration`: one bounded execution pass inside a run. Each iteration starts by reloading disk state and relevant repo facts, not by trusting prior chat memory.
- `episode`: a bounded interaction artifact such as a room exchange, debate, review, or approval event. Episodes may be linked from a run, but they are not dumped wholesale into worker prompts.
- `approval_state`: the persisted approval status for the next gated action. Recommended values for v0 contracts are `not_required`, `pending`, `approved`, `rejected`, and `expired`.
- `stop_reason`: the persisted reason a run or iteration stopped.

## stop_reason Enum

- `verified`
- `max_iterations`
- `max_tokens`
- `max_cost`
- `stuck`
- `escalated`
- `aborted`

## Invariants

- Iterations must be resumable from disk without hidden in-memory state.
- Context files under `.conitens/context/` are the bounded source of prompt context.
- Full transcript prompt stuffing is prohibited; use distilled summaries and explicit artifact links instead.
- Persona identity core is not auto-edited by the loop.
- LangGraph is reserved for orchestration-core wiring.
- AG2 is reserved for user-visible room, debate, and review episodes only.
