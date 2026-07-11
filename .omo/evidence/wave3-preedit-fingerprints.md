# Wave 3 pre-edit fingerprints

Captured: 2026-07-11 before Wave 3 production/test edits

Existing dirty paths in the Wave 3 surface:

- modified: `.conitens/context/{LATEST_CONTEXT,findings,progress,task_plan}.md`
- modified: `packages/dashboard/tests/forward-bridge.test.mjs`
- modified: `scripts/ensemble_forward.py`
- modified: `scripts/ensemble_forward_bridge.py`
- modified: `scripts/ensemble_room_service.py`
- modified: `tests/test_forward_bridge.py`
- modified: `tests/test_forward_live_approval.py`
- modified: `tests/test_forward_runtime_mode.py`
- untracked: `tests/test_forward_bridge_boundary.py`

SHA-256 fingerprints:

- `scripts/ensemble_forward_bridge.py`: `38f6f9cc30b1a3e6b56d9551aa6fe1f0703f7f47394d00f7fdd8f77b09c80ef9`
- `scripts/ensemble_forward.py`: `bd3f5619486ea7d92e4f90422a0756be978afef604f1e618568a461831226b38`
- `scripts/ensemble_room_service.py`: `7bf08990d1f959616e88c2421d8fa380de292ca092f5a5960e255b6b84f76b08`
- `scripts/ensemble_replay_service.py`: `8e746126b6b6ad1622704a579d11b31e54a401983585d6e5e2b7c3f3e86b5f57`
- `scripts/ensemble_agent_registry.py`: `23006487b19d4cbc151d13da683c36075b4715e1f2a1848d49004e8b6fe7da4e`
- `tests/test_forward_bridge.py`: `fd06d47bd3620f8ddbaed19754b1c5da0fd3ec774225d666c0555852ac25a68a`
- `tests/test_forward_bridge_boundary.py`: `22041805314db3ff757a96f9449b1c1c974baf8522b9459ea5dbae02331abd3b`
- `tests/test_forward_live_approval.py`: `2ae2f0a0afa49cba46fed3ca8524698e4b67d51892d428d77b30f45f8b255e26`
- `tests/test_forward_runtime_mode.py`: `10d84fd70ed881e0a616c4f4d7943dbba707ac3a8abbf8e8b8d8f6e01e6a4535`
- `packages/dashboard/tests/forward-bridge.test.mjs`: `25fc56876dce9379aa553531113e7cb0c52756ef23498e5d70ee0a78ed33c584`

No reset, checkout, or whole-file replacement is permitted against these shared
dirty paths. Wave 3 edits must be narrow and preserve prior content.
