---
schema_v: 1
name: "Research Plan Validate"
slug: "wf.research-plan-validate"
description: "Read-heavy discovery flow with typed research handoff and audit event emission."
execution_support: active
inputs:
  task_id:
    type: string
    required: true
  topic:
    type: string
    required: true
  research_cmd:
    type: string
    required: true
steps:
  - id: research
    kind: agent
    agent_id: researcher-subagent
    summary: "Research {{topic}}"
    cmd: "{{research_cmd}}"
    artifact_type: research
    on_fail: stop
  - id: record
    kind: emit_event
    event_type: WORKFLOW_RESEARCH_RECORDED
    payload:
      topic: "{{topic}}"
      task_id: "{{task_id}}"
    on_fail: continue
  - id: validate
    kind: cli
    cmd: python -c "print('validated {{topic}}')"
    on_fail: stop
---

# Notes

- Intended for discovery and planning loops before implementation.
