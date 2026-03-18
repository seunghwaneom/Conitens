---
schema_v: 1
name: office-report
description: "Generate operational snapshots that combine tasks, locks, approvals, verify status, events, and meetings."
tools:
  - id: office.report
    mode: exec
    requires_approval: false
    cli: "python scripts/ensemble_office.py --workspace {{workspace}} --format {{format}}"
---

# Usage

- Prefer static markdown or HTML first.
- Use generated office reports for status review, not as a replacement for canonical logs.
