# Batch 11 Wave 1-2 Summary

## Packet fields kept/removed/merged

- Kept:
  - `agent_id`
  - `persona_core`
  - `objective`
  - `current_step`
  - `relevant_findings`
  - `latest_runtime_digest`
  - `latest_repo_digest`
  - `episodic_memory_top_k`
  - `recent_message_slice`
  - `tool_whitelist`
  - `token_budget`
  - `done_when`
  - `validator_failure_reason`
- Removed from effective packet sourcing:
  - raw legacy room transcript file reads
  - procedural memory from default packet memory selection
  - identity memory from default packet memory selection
- Merged/clarified:
  - `recent_message_slice` now means `handoff_summary` first, otherwise bounded
    `room_episode_summary`
  - `tool_whitelist` now comes from skill metadata, not full skill body loads

## New exclusion rules

- Default execution context denies raw full room transcript as a source.
- Unapproved patches remain excluded.
- Identity memory remains excluded.
- Procedural memory is excluded from the default packet memory slice.
- Recent-message source order is explicit:
  1. `handoff_summary`
  2. `room_episode_summary`

## Packet budget assumptions

- token budget remains caller-supplied but packet internals are bounded:
  - episodic top-k hard-capped at 3
  - recent message limit hard-capped at 3
  - room summary limit hard-capped at 2 rooms
  - per-room message count hard-capped at 2
  - message text truncation hard-capped at 80 chars
- packet metrics now expose:
  - field sources
  - exclusion rules
  - source counts
  - section sizes

## Snapshot coverage added

- fresh run packet scenario
- validator failure rerun scenario
- long room history bounded summary scenario
- rich memory namespace exclusion scenario
- approval rejection feedback scenario
- metadata-only task delegation scenario
