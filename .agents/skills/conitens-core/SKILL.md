---
schema_v: 1
name: conitens-core
description: "Core Conitens task, verify, workflow, and state contracts for Codex-compatible agents."
tools:
  - id: task.create
    mode: write
    requires_approval: true
    cli: "ensemble new --mode {{mode}} --case {{case}} --title {{title}}"
  - id: task.verify
    mode: exec
    requires_approval: false
    cli: "ensemble verify --task {{task_id}} --files {{files}}"
  - id: workflow.run
    mode: exec
    requires_approval: false
    cli: "python scripts/ensemble_workflow.py --workspace {{workspace}} run --workflow {{workflow}}"
---

# Usage

- Prefer read-only inspection before write paths.
- Never bypass the verify gate.
- Use `.agent/workflows/` contracts as the canonical workflow source.
