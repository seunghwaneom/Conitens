---
schema_v: 1
name: mcp-readonly
description: "Read-only MCP surface for tasks, locks, context, questions, and meetings."
tools:
  - id: mcp.serve
    mode: exec
    requires_approval: false
    cli: "python scripts/ensemble_mcp_server.py --workspace {{workspace}} serve"
  - id: mcp.tool.call
    mode: read
    requires_approval: false
    cli: "python scripts/ensemble_mcp_server.py --workspace {{workspace}} call {{tool}}"
---

# Usage

- Keep write tools disabled by default.
- Route any future write tool through existing approval gates.
