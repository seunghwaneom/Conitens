---
schema_v: 1
name: "Invalid Kind"
slug: "invalid-kind"
steps:
  - id: bad
    kind: bogus
    cmd: "echo nope"
    on_fail: stop
---
