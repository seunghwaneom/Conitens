# Wave 3 Forward Bridge refactor — final gate review

- Date: 2026-07-11 (Asia/Seoul)
- recommendation: APPROVE
- blockers: none

## originalIntent

Refactor `scripts/ensemble_forward_bridge.py` into a compatibility and assembly
facade over bounded query, command, stream, HTTP, public-context,
collaboration-read/legacy, and patch-decision owners. Query and GET behavior had
to remain physically write-free, browser-visible projections had to be bounded
and privacy-safe, HTTP had to remain a transport boundary, patch decisions had
to preserve actor/workspace/reason and event ordering, and Forward had to remain
quarantined with `default_runtime=legacy`. The work could not add dependencies,
change persona identity core, bypass approval/verification, or widen into
unrelated cleanup.

## desiredOutcome

An operator can use the existing bridge and dashboard contracts without losing
compatibility, while read paths do not materialize state, public payloads do not
expose private message bodies, paths, usernames, credentials, actors, reviewers,
or handoff packets, command routes retain their gates and ordering, oversized
HTTP requests fail in a bounded way, and the refactor creates honest module
boundaries rather than a file-size workaround. Forward remains an explicitly
quarantined sidecar rather than becoming the default or authoritative runtime.

## userOutcomeReview

The settled artifact satisfies the requested user-visible outcome.

- The facade exposes the preserved 27-name query contract and launch/stream
  compatibility while delegating to bounded owners.
- Missing-state queries return empty payloads without creating SQLite or parent
  directories; existing databases are opened read-only and account for WAL/SHM.
- Raw thread bodies are not searchable. Public metadata remains searchable.
- One shared projection owner allowlists approval and handoff fields. Unsafe
  actor/reviewer values become neutral labels, unsafe handoff text falls back to
  `handoff blocked`, and public handoff packets are empty. Query, command, and
  SSE paths reuse this owner.
- The root bridge page inventories all 13 authenticated mutation routes, and the
  boundary document explicitly catalogs event-first and Forward-only projection
  debt without presenting that debt as promotion.
- Patch approval preserves workspace, actor, and reason; approval authority is
  appended before applied authority/projections, and retry/order behavior is
  covered.
- `forward status` reports `default_runtime=legacy`; legacy `--forward start`
  still exits 2 as a status-only compatibility path.

## Direct programming and remove-ai-slops pass

I loaded and applied `omo:programming` (including its Python and code-smell
criteria) and `omo:remove-ai-slops` directly over the production split and final
tests.

- The prior 18-module wildcard/dynamic-export chain is gone. All 19 query files
  use explicit imports and fixed exports; the facade has a fixed 27-name public
  surface.
- The shared public-projection module owns a real cross-surface privacy
  invariant. It is not an arbitrary parsing/normalization layer: its reuse by
  query, command, and SSE paths removes the previously demonstrated drift.
- No new dependency, speculative framework, needless compatibility shim,
  production-only test helper, or unrelated cleanup was introduced.
- The privacy and metadata-search tests exercise seeded persisted data through
  public builders and multiple consumers. They are not deletion-only,
  requested-removal-only, tautological, conditional-no-assert, or
  constant-mirroring tests.
- The AST/source architecture checks are implementation-aware but enforce durable
  boundary constraints and are paired with behavioral tests for write freedom,
  privacy, transport delegation, compatibility, and state-machine ordering.
  They therefore do not provide false confidence by themselves.
- The root-route inventory test verifies the actual generated public contract;
  it is not merely a test that a requested symbol was deleted.
- The scoped no-excuse checker reports zero violations across all 37 Wave 3
  Python files. Pure leaf modules remain within the selected Python size gate.

The settled code-review report independently records the same skill-perspective
pass and explicitly covers excessive/useless tests, deletion-only and
requested-removal-only tests, conditional no-assert tests, tautologies,
constant/implementation mirroring, needless parsing/normalization, and the
production extraction/import boundary. Its claims are supported by the settled
files and the direct checks below.

## Independent executable verification

- Complete Wave 3 bundle: `Ran 158 tests in 99.636s` — `OK`.
- Focused architecture/privacy slice: `Ran 16 tests in 1.621s` — `OK`.
- `py_compile`: all 37 scoped Python files passed.
- Programming no-excuse checker: `no violations in 37 file(s)`.
- Query boundary scan: zero wildcard imports and zero dynamic-global exports in
  19 query files.
- `git diff --check`: exit 0; only line-ending notices.
- `forward status --format json`: exit 0 with `default_runtime: legacy`.
- Legacy `--forward start`: exit 2 with the expected status-only error.
- Earlier in this gate session, dashboard tests passed 154/154 and its TypeScript
  and Vite production build passed. The final repair set changed Python,
  Python tests, evidence, and context rather than dashboard production code; the
  final GREEN artifact also records the post-repair dashboard test/build pass.
- Refreshed manual QA records real loopback auth, traversal rejection,
  metadata-only thread search, query/command/SSE privacy projections, all 13
  mutation routes, malformed/negative/extreme body handling, ten consecutive
  clean oversized-body recoveries, SSE frames, and joined server shutdown.

The complete suite emitted expected negative-path HTTP logs, two unclosed-test
`HTTPError` warnings, and one Windows client-abort traceback. The dedicated HTTP
stability and manual-QA evidence repeatedly passes the affected product path, so
this is non-blocking test-harness noise rather than a demonstrated bridge defect.

## Checked artifact paths

Plans and outcome contract:

- `.omx/plans/prd-wave3-forward-bridge-refactor.md`
- `.omx/plans/test-spec-wave3-forward-bridge-refactor.md`
- `.omx/context/wave3-forward-bridge-refactor-20260711T011656Z.md`

Verification and review evidence:

- `.omo/evidence/wave3-forward-bridge-green.txt`
- `.omo/evidence/wave3-forward-bridge-manual-qa.md`
- `.omo/evidence/wave3-debugging-audit.md`
- `.omo/evidence/wave3-forward-bridge-review-work.md`
- `.omo/evidence/wave3-http-quality-split.md`
- `.omo/evidence/wave3-query-quality-split.txt`
- `.omo/evidence/wave3-command-conversation-quality.txt`
- `.omo/evidence/wave3-forward-bridge-refactor-code-review.md`
- `.omo/evidence/wave3-forward-bridge-settled-code-review.md`

Boundary, context, and history evidence:

- `docs/frontend/BRIDGE_BOUNDARY.md`
- `.conitens/context/task_plan.md`
- `.conitens/context/findings.md`
- `.conitens/context/progress.md`
- `.conitens/context/LATEST_CONTEXT.md`
- `.vibe/context/LATEST_CONTEXT.md`
- `.omo/notepads/ulw-ZWyran.md`

Production and test surfaces inspected directly:

- `scripts/ensemble_forward_bridge.py`
- `scripts/ensemble_forward_bridge_query.py` and all
  `scripts/ensemble_forward_bridge_query_*.py` leaves
- `scripts/ensemble_forward_bridge_commands.py` and all
  `scripts/ensemble_forward_bridge_command_*.py` leaves
- `scripts/ensemble_forward_bridge_http.py` and all
  `scripts/ensemble_forward_bridge_http_*.py` leaves
- `scripts/ensemble_forward_bridge_stream.py`
- `scripts/ensemble_forward_bridge_public_projection.py`
- `scripts/ensemble_forward_public_context.py`
- `scripts/ensemble_conversation_read_service.py`
- `scripts/ensemble_conversation_legacy_reader.py`
- `scripts/ensemble_agent_patch_service.py`
- `scripts/ensemble_agent_registry.py`
- `scripts/ensemble_approval.py`
- `scripts/ensemble_loop_repository.py`
- The 14 Python test modules in the complete Wave 3 command, plus the final
  regression sections in architecture, public-context, boundary, command, and
  HTTP tests.

## Exact evidence gaps

No blocking evidence gap remains.

- `.omo/notepads/ulw-ZWyran.md` exists but does not contain a useful Wave 3
  execution narrative. Neither this decision nor the settled code review relies
  on it; the PRD, test spec, current context, GREEN evidence, manual QA, direct
  source inspection, and independent commands cover the outcome.
- A Python LSP server was unavailable in the recorded review lanes. Independent
  `py_compile`, the 37-file no-excuse checker, and 158 behavioral tests provide
  the scoped executable substitute.
- The adjacent legacy operations baseline remains 2 failures and 9 errors for
  separately catalogued event-alias/persona-manifest drift. No reviewed Wave 3
  module participates in those paths, so this is not evidence of a scoped
  regression.
- Direct Forward-only projections and approval reviewer semantics remain
  promotion debt. They are explicitly catalogued and keep Forward quarantined;
  this gate approves the requested boundary refactor, not ADR-0004 promotion.
