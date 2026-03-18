---
schema_v: 1
name: meeting-recorder
description: "Append-only meeting capture and replay for agent-to-agent coordination."
tools:
  - id: meeting.start
    mode: write
    requires_approval: false
    cli: "ensemble meet start --topic {{topic}}"
  - id: meeting.post
    mode: write
    requires_approval: false
    cli: "ensemble meet say --meeting {{meeting_id}} --sender {{sender}} --text {{text}}"
  - id: meeting.show
    mode: read
    requires_approval: false
    cli: "ensemble meet show --meeting {{meeting_id}}"
---

# Usage

- Treat transcript JSONL as the source of truth.
- Treat summaries as derived artifacts that may be regenerated.
