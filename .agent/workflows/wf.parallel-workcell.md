---
schema_v: 1
name: "Parallel Workcell"
slug: "wf.parallel-workcell"
description: "Bounded parallel branches with explicit join validation."
execution_support: feature-flagged
inputs:
  task_id:
    type: string
    required: true
steps:
  - id: fanout
    kind: parallel
    on_fail: stop
    branches:
      - id: map
        lease_paths: ["workspace/map"]
        cmd: python -c "print('map {{task_id}}')"
      - id: impact
        agent_id: researcher-subagent
        owner_transfer: true
        worktree_id: "impact-{{task_id}}"
        lease_paths: ["workspace/impact"]
        summary: "Impact scan {{task_id}}"
        cmd: python -c "print('impact {{task_id}}')"
  - id: join
    kind: join
    depends_on: [fanout]
    on_fail: stop
---

# Notes

- Parallel and join are reserved until `CONITENS_ENABLE_PARALLEL_WORKCELL=1` or an equivalent input flag enables the feature.
- Current implementation is metadata-first and only supports a limited flagged execution path.
