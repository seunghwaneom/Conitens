# Architecture Direction Plan Review Evidence

- Reviewed artifact: `docs/conitens-architecture-direction-refactor-plan-2026-07-10.md`
- Review date: 2026-07-10
- Scope: planning and documentation only; no runtime implementation was changed
- Worktree note: the repository was already dirty. Attribution in this report is limited
  to the new planning/audit/review artifacts and the four required context documents.

## User Goal Traceability

| User goal | Plan coverage | Acceptance check | Result |
|---|---|---|---|
| Analyze prior project conversations | §2.1, §4 | Stable user intent and non-negotiable boundaries are extracted from session records | PASS |
| Analyze the current code | §2.2, §3 | Active runtime, forward stack, bridge/dashboard, direct-write and large-module evidence are named | PASS |
| Plan the architecture | §5, §6 | Current/target diagrams, plane responsibilities, authority table, vocabulary and promotion gate exist | PASS |
| Clarify product direction | §4 | Product identity, user value and explicit non-goals are stated | PASS |
| Plan refactoring | §7–§14 | Exit-gated waves, priority backlog, PR slices, verification gates, metrics and risks exist | PASS |
| Respect repo contracts | §5–§8 | Event-first, additive Python facade, approval/verify, no raw private transcript in events, no v0 vector DB | PASS |

## Semantic Cleanup Review

The planning artifact was checked against the `ai-slop-cleaner` and programming
discipline criteria that apply to a refactor plan.

- Behavior lock precedes every cleanup slice.
- One domain/seam is changed per PR; no repo-wide cleanup sweep is proposed.
- Existing wrappers, helpers and public paths are preserved before introducing new
  abstractions.
- No new dependency, state library, vector store or cross-language rewrite is proposed.
- Active runtime and reference/parity surfaces are classified before prioritization;
  `packages/command-center` is quarantined rather than cleaned merely because it is large.
- Generated audit counts are treated as review cues, not architecture truth or numerical
  refactor targets.
- File-size reduction is not the primary success criterion; authority and behavioral seams
  are.
- The plan contains no implementation patch. Programming criteria are therefore evaluated
  as proposed gates: characterization first, additive `ensemble_*.py` leaves, schema parity,
  focused tests, and compatibility facades.

Result: PASS. No overfit-to-audit or broad cleanup directive remains.

## Hypothesis-Driven Runtime Audit

### H1 — Legacy and forward state ownership are simultaneously visible

- Hypothesis: the primary architecture risk is an unresolved relation between the active
  legacy runtime and forward SQLite owners.
- Observation: `python scripts/ensemble.py --workspace . forward status --format json`
  reports `default_runtime=legacy` and active truth as `scripts/ensemble.py + .notes/ +
  .agent/`, while the same response labels forward `runs`, `iterations`, `messages`,
  approvals and operator entities as SQLite-owned/authoritative.
- Verdict: CONFIRMED. The promotion/authority ADR must precede implementation.

### H2 — The Forward Bridge is a mutation surface without a bridge-level event append

- Hypothesis: the read-only label hides direct command/storage behavior.
- Observation: the bridge implements `POST`, `PATCH`, and `DELETE`, directly invokes
  operator task/workspace repository methods and approval/runtime methods, while a scoped
  search finds no `append_event()` call in `scripts/ensemble_forward_bridge.py`.
- Verdict: CONFIRMED. Query/command characterization and event-boundary inventory are P0.

### H3 — Existing payload contracts are not yet safe or sufficient to freeze

- Hypothesis: preserving current payloads without characterization would preserve either
  missing replay data or sensitive local path exposure.
- Observation A: `ROOM_MESSAGE` events do not contain enough message content/evidence data
  to rebuild the current room log.
- Observation B: the live forward status command emits absolute workspace/artifact paths;
  operator workspace detail also persists/returns a `path` field.
- Verdict: CONFIRMED. Room payload sufficiency and browser-visible path leakage tests must
  precede contract preservation.

No debug instrumentation or temporary source edit was created for this audit.

## Review Lanes

| Lane | Reviewer | Result | Resolution |
|---|---|---|---|
| Architecture critic | `plan_critic` | PASS | Payload sufficiency, meeting evidence boundary, phase metrics, patch shortcut and UI slice fixes applied |
| Fact check | `plan_fact_check` | PASS | LOC, current-vs-target path behavior, bridge/event and masked transcript claims verified |
| Manual artifact QA | `plan_manual_qa` | PASS | UTF-8, headings, fences, two Mermaid blocks, paths, commands and discoverability checked |
| Security | `plan_security_review` | PASS | Transcript/private raw and browser-visible path rules added |
| Goal/constraint gate | `plan_goal_gate` | PASS | Planned ADR changed from occupied `0003` to unused `0004`; traceability and semantic review evidence accepted |

Detailed manual QA evidence:

- `.omo/evidence/plan-manual-qa/manualQa-matrix.json`
- `.omo/evidence/plan-manual-qa/utf8-check.txt`
- `.omo/evidence/plan-manual-qa/structure-fences-mermaid-paths-commands-corrected.txt`

## Known Limits

- The structure audit scans tracked source and is heuristic; it does not prove semantic
  defects.
- Fixed-port Forward Bridge HTTP tests remain unreliable on this Windows host because of
  the previously recorded `WinError 10013`; the plan therefore requires pure builder/policy
  tests and dynamic-port CI smoke.
- No refactor implementation was attempted in this planning task, so runtime behavior was
  observed but not changed.
