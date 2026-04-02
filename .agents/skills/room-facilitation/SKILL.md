---
schema_v: 1
skill_id: room-facilitation
name: room-facilitation
description: "Guide structured room, debate, and review episodes without collapsing them into transcript-heavy prompts."
triggers:
  - room-facilitation
  - facilitate-room
expected_capabilities:
  - frame a room objective
  - capture decisions and action items
  - keep facilitation separate from runtime mutation
references:
  - .conitens/rooms/
  - .conitens/context/LATEST_CONTEXT.md
---

# room-facilitation

## Workflow

1. Set the room objective and the concrete question to resolve.
2. Keep the exchange structured around decisions, blockers, and next actions.
3. Write concise summaries and action items rather than replaying full transcripts.
4. Hand off outcomes back into the runtime context if needed.

## Constraints

- AG2 room/review episodes stay separate from normal worker prompts.
- Do not stuff full room history into later tasks.
- Facilitation is not authorization; risky actions still need gates.
