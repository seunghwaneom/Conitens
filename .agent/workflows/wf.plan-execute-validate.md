---
schema_v: 1
name: "Plan Execute Validate"
slug: "wf.plan-execute-validate"
description: "Manager-driven implementation flow with explicit approval, typed handoff, and verify."
execution_support: active
inputs:
  task_id:
    type: string
    required: true
  files:
    type: string
    required: true
  summary:
    type: string
    required: true
  implement_cmd:
    type: string
    required: true
  approval_question:
    type: string
    required: false
steps:
  - id: owner-approval
    kind: approval
    question: "{{approval_question}}"
    action_class: workflow.resume
    on_fail: stop
  - id: implement
    kind: agent
    agent_id: implementer-subagent
    owner_transfer: true
    summary: "{{summary}}"
    cmd: "{{implement_cmd}}"
    files: ["{{files}}"]
    artifact_type: subagent
    on_fail: stop
  - id: verify
    kind: verify
    files: "{{files}}"
    on_fail: stop
---

# Notes

- Uses manager-default orchestration.
- Requires owner confirmation before resuming the implementation lane.
