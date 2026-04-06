---
title: "ADR-0002: Product Surface and Persistent Agent Promotion"
date: 2026-04-06
status: accepted
deciders: [user, claude-architect, claude-critic]
---

# ADR-0002: Product Surface and Persistent Agent Promotion

## Context

Conitens v2 currently has its active control-plane truth in Python `ensemble` scripts + `.notes/` + `.agent/`. The dashboard has office-preview metaphor but limited operational screens. The improvement plan proposes shifting focus from Office metaphor expansion to persistent agents, communication records, and CLI-first operations.

## Decision

We adopt the following 7 product-surface decisions:

### D1. `.notes/` = Obsidian Vault (projection from events)

`.notes/` serves as the human-readable Obsidian Vault, but all content is **projected from** `events/*.jsonl` — the sole commit point (Invariant I-1). `.notes/` files are views, not primary stores.

- Human-readable records: `.notes/**/*.md`
- Machine acceleration: SQLite/JSON sidecar allowed at `.notes/.index/`
- Principle: events are canonical, Markdown is the human-readable projection

### D2. `.agent/` = canonical agent config surface

Persistent agent definitions live in `.agent/agents/*.yaml`. Existing `.conitens/personas/` serves as a compatibility/import layer. Only approved agent manifests are promoted to `.agent/`.

### D3. Hermes = stateful shell (not a new control plane)

Hermes provides workspace × role based stateful shells for agents. It is NOT an orchestrator replacement — agents (Supervisor, Recorder, Improver, Worker) work inside Hermes shells.

### D4. OpenViking = long-term context plane (via Hermes provider)

Initial adoption through Hermes memory provider. AGPL-3.0 license review required before integration. Stores approved summaries, reusable playbooks, decisions, durable findings.

### D5. UI focuses on Inbox/Threads/Agents/Approvals/Run Detail

Office-preview is demoted to secondary navigation. For the next 2 batches, investment goes to: Threads, Agents, Inbox, Approvals, Run Detail.

### D6. All new features extend Python core additively

Following ADR-0001, `scripts/ensemble.py` is never replaced. New `scripts/ensemble_*.py` modules are added.

### D7. Token optimization is a design default

"Record richly, prompt sparingly." L0/L1/L2 compression tiers. Full transcript never auto-loaded into prompts.

## .notes/ Migration Mapping

Existing 12 directories migrate to numbered Obsidian structure:

| Existing Directory | Target | Action |
|---|---|---|
| `ACTIVE/` | `00_Inbox/` | Move. Convert `_pending_questions.json` to frontmatter MD |
| `agents/` | (delete) | Empty directory. `.agent/agents/` is canonical |
| `artifacts/` | `80_Archive/artifacts/` | Move. Preserve `manifest.jsonl` |
| `context/` | (keep at root) | `LATEST_CONTEXT.md` is `.vibe/` sidecar role |
| `EVENTS/` | (keep at root) | Event log canonical store. Never move |
| `gates/` | `80_Archive/gates/` | Move. Preserve existing `G-*.json` files |
| `MEETINGS/` | `80_Archive/meetings/` | Move. Preserve summaries |
| `OFFICE/` | `80_Archive/office/` | Move. Office metaphor deprioritized |
| `recovery/` | `80_Archive/recovery/` | Move. Preserve 2026-03-18 archive |
| `RESEARCH/` | `70_Reviews/research/` | Move. Preserve agent-orchestration report |
| `rooms/` | `40_Comms/legacy-rooms/` | Move. Preserve room JSONL transcripts |
| `subagents/` | `80_Archive/subagents/` | Move. Preserve `ACTIVE/`, `COMPLETED/` subdirs |

**Principle**: No data deletion. Move only. `_MOVED_TO.md` redirect notes at original locations.

## Event-First Architecture

All new features emit events to `events/*.jsonl` FIRST, then project to `.notes/`:

- `ensemble_comms.py` → emits `thread.*` events → `ensemble_obsidian.py` projects to `.notes/40_Comms/`
- `ensemble_agent_registry.py` → emits `agent.*` events → projects to `.notes/10_Agents/`
- `ensemble_improver.py` → emits `improver.*` events → projects to `.notes/70_Reviews/`
- `ensemble_background.py` → emits `background.*` events → projects to `.notes/30_Runs/`

Projection is **synchronous** within CLI commands. `rebuild_all()` can regenerate all `.notes/` from events alone (I-2 compliance).

## Consequences

### Positive
- I-1/I-2 invariant compliance maintained
- Obsidian users can browse all records
- CLI-first operation without GUI dependency
- Token budget enforced structurally

### Negative
- 6+ week implementation timeline
- Batch 0 infrastructure work delays first user-visible feature to Batch 2
- Office metaphor investment is frozen (existing components maintained but not extended)

### Risks
- OpenViking AGPL-3.0 may require legal review before Batch 4
- Python scripts growing to 50+ files without package structure (deferred to post-Batch 5 ADR)

## Related
- ADR-0001: Control Plane (predecessor)
- RFC-1.0.1: Protocol specification
- Improvement Plan: `docs/superpowers/plans/2026-04-06-conitens-improvement-plan.md`
