# Wave 3 Forward Bridge settled-state review work

Date: 2026-07-11 (Asia/Seoul)
Pre-gate verdict: PASS

## Review lanes

- Goal/constraint review: module ownership, legacy default, event authority, and
  quarantine matched the PRD; it identified the raw-message search oracle.
- Context/consumer review: facade exports, late monkeypatch binding,
  ConversationReadService consumers, dashboard parsers, and runtime quarantine
  remained compatible; it identified an incomplete root command inventory.
- QA review: focused/full Python, dashboard, build, CLI, and live HTTP evidence
  passed; the adjacent 2-failure/9-error baseline was correctly separated.
- Code-quality review: initially blocked on read materialization, secret shapes,
  legacy discovery, patch scope/actor propagation, oversized extracted modules,
  a conditional no-assert test, public labels, and raw agent blocker text.
- Security review: initially blocked on raw inbox/agent handoff text and the
  raw-message search oracle.

## Blocker closure

- Missing databases are not created by reads; existing SQLite is opened in
  read-only URI mode with WAL-aware immutable handling.
- Public context rejects common paths, credential URLs, bearer values, cloud
  credentials, and secret-shaped values.
- Legacy thread discovery is contained under its compatibility root, while public
  search now matches only structural/public metadata and never raw messages.
- Patch approval carries workspace, actor, and reason; approval is retryable and
  applied is the single terminal event. Approval SQLite rows follow event append.
- Query, HTTP, and command clusters were split into cohesive leaves. Query modules
  use direct imports and a fixed 27-name facade rather than wildcard/dynamic export
  chains. The scoped programming checker reports zero violations in all 37 Wave 3
  files. The earlier 68-count included four large pre-existing legacy modules and
  is retained as legacy debt, not represented as a new-leaf failure.
- The reject behavior test is unconditional; unsafe approval actors/reviewers and
  handoff reasons use strict public sanitization and neutral fallbacks.
- One shared allowlisted projection now shapes public approval, actor, and handoff
  records across query, command, and SSE paths.
- Root documentation lists all 13 operator mutation routes.
- HTTP uses constant-time token comparison, bounded request bodies, sanitized
  unexpected errors, and a bounded overflow drain that is stable on Windows.

## Settled evidence

- Focused boundary: 67 tests in 9.826 seconds, OK.
- Complete Wave 3: 158 tests in 94.117 seconds, OK.
- HTTP stress: 11 tests, including ten live overflow requests, OK.
- Dashboard: 154 tests, OK; production build, OK.
- Static: 37 Wave 3 files with zero no-excuse violations; Python compile and diff
  validation, OK.
- Manual: CLI, authentication, traversal, public privacy, metadata-only search,
  SSE, malformed/negative/oversized body, and shutdown scenarios passed.

## Residual risk and scope

Forward-only direct SQLite projections and approval reviewer semantics remain
promotion blockers recorded in `docs/frontend/BRIDGE_BOUNDARY.md`; they do not
become legacy authority and Forward remains quarantined. The adjacent legacy
event-alias/persona-schema failures are unchanged and outside this slice. No new
dependency, runtime-default change, persona-core edit, or unrelated-worktree
cleanup was performed.

The independent settled code review returned `CLEAR / APPROVE` with no findings
or blockers. The final LazyCodex gate returned `APPROVE` with no blockers, so the
Ralph execution may be closed.
