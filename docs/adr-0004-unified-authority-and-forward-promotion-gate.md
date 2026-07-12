# ADR-0004: Unified Authority And Forward Promotion Gate

Status: Accepted
Date: 2026-07-10

## Context

Conitens currently has two active lineages:

- the legacy operating runtime: `scripts/ensemble.py` plus additive
  `scripts/ensemble_*.py`, `.notes/`, and `.agent/`
- the Forward runtime: `LoopStateRepository` SQLite state, `.conitens/context`,
  the Forward Bridge, and `packages/dashboard`

Both lineages are useful, but they cannot both be treated as workspace durable
truth. The current product contract still says `events/*.jsonl` is the sole
commit point, `.notes` is rebuildable projection, and `.agent` is the
configuration authority. Forward SQLite owns bounded operational state inside
the Forward runtime, not the whole workspace.

## Decision

Conitens keeps the event ledger as workspace durable truth until a later ADR
explicitly promotes another authority.

Forward SQLite remains a bounded operational owner and query index for Forward
run state. It may own in-flight run, iteration, room, task, workspace, approval,
and operator UI state inside the Forward runtime, but it is not the default
workspace authority until all promotion gates pass.

`.notes` and `.conitens/context` are projections. Compatibility mirrors may
exist for legacy readers, but new durable domain mutations must cross a command
or event authority boundary before projection writes.

Forward fails promotion now. Gates 1, 6, and 7 are contradicted by current
bridge behavior, and gates 2, 3, 4, 5, and 8 remain unproven. The security
gate fails because browser-visible Forward context can still include raw prompt,
transcript, stdout, and stderr bodies, secret-shaped strings, and absolute POSIX
paths. A blacklist sanitizer is not an allowlisted public projection. This
ADR therefore accepts explicit Forward quarantine: Forward remains an additive
operator/read-model sidecar with a bounded authenticated command surface while
`scripts/ensemble.py` plus `.notes/`, `.agent/`, and the event ledger remain
current authority. `default_runtime=legacy` remains unchanged.

Meeting transcript JSONL is a special append-only transcript/evidence ledger.
It can remain canonical evidence for what was said under redaction policy, but
it is not domain state authority. Meeting state such as active meeting,
summary, and operator-visible decisions must be represented through
policy-approved events, metadata, hashes, or evidence refs. Unredacted private
content must not be copied into events or browser-visible payloads.

## Terms

| Term | Meaning |
| --- | --- |
| legacy | Current operating lineage rooted in `scripts/ensemble.py`, `.notes`, and `.agent`. |
| forward | Additive disk-backed loop/runtime rooted in `LoopStateRepository`, `.conitens/context`, Forward Bridge, and dashboard views. |
| projection | Rebuildable view derived from events or operational state; not durable truth. |
| compatibility mirror | Legacy file or payload shape retained for existing readers while the target boundary moves. |
| authority command | Validated mutation intent with actor, rationale, idempotency, risk, approval, and event/projection behavior. |
| operational owner | Component that owns bounded runtime state inside one execution surface without becoming workspace truth. |
| promotion gate | Evidence required before Forward or another state store can become the default authority. |

## State Owner Map

| Surface | Current owner | Target boundary | Write rule |
| --- | --- | --- | --- |
| `events/*.jsonl` | `append_event()` | workspace durable truth | Only event append helpers after validation/redaction. |
| `.agent/` | legacy config surface | versioned workflow/skill/agent config | Approved config command only. |
| `.agents/skills/` | compatibility skill surface | progressive-disclosure mirror | Keep mirrored to `.agent` contracts. |
| `.notes/` | mixed legacy files and projections | event-derived human projection plus compatibility mirror | Projector/compatibility writer only after event authority. |
| Forward SQLite | Forward runtime repository | bounded operational owner and query index | Command service/projector writes; no default runtime promotion. |
| `.conitens/context/` | generated digest checked into repo | generated execution/context digest | Context projector or explicit planning update. |
| `.vibe/` | repo intelligence sidecar | freshness-gated derived intelligence | Generator/hook writes only. |
| Dashboard local state | browser runtime | ephemeral UI state | Browser only; no durable authority. |
| Meeting transcript JSONL | transcript evidence ledger | canonical transcript/evidence, not state authority | Redacted transcript append; link to events/refs for state transitions. |
| Harness logs | provider/harness local files | external/private evidence source | Store only metadata or refs in Conitens events/payloads. |

## Forward Bridge Boundary

The Forward Bridge is not wholly read-only.

It has two surfaces:

- Query surface: `GET` routes and SSE/read models. These must be side-effect
  free, must not mutate repositories or files, and must redact browser-visible
  payloads.
- Operator command surface: authenticated `POST`, `PATCH`, and `DELETE` routes
  for task, workspace, approval, resume, archive, restore, and related operator
  actions. These are mutations and must move behind explicit command services
  with event/projection behavior defined per command.

Bridge transport code should handle auth, body limits, routing, response
encoding, and loopback restrictions. It should not directly own storage policy.

## Promotion Gates

Forward must not become the active default runtime until all gates pass:

1. Durable mutations are event-first or use an explicitly documented
   transactional outbox.
2. Room, handoff, task, approval, run, and iteration owner maps are unified.
3. Event replay and DB restore produce the same observable state for promoted
   domains.
4. Approval and verify pause/resume are at least as strict as the legacy CLI.
5. Migration, rollback, compatibility aliases, and legacy import paths are
   documented and tested.
6. Bridge/dashboard security regression tests pass, including path, username,
   token, secret-shaped string, transcript, prompt, and stdout/stderr leakage.
7. Query and operator command routes are separated by tests and module
   boundaries.
8. Failure handling proves projection failure after event append is recoverable,
   and event append failure leaves no newly committed projection.

## Quarantine And Compatibility Rules

- Forward is an additive operator/read-model sidecar unless a later ADR passes
  every promotion gate and changes the default runtime.
- `packages/command-center` remains reference/parity/frozen until a later ADR
  promotes it.
- `scripts/ensemble.py` remains the CLI facade.
- `scripts/ensemble_forward_bridge.py` remains the launch/import compatibility
  facade while route internals move behind query/command/http/stream helpers.
- Legacy `.notes/rooms` readers and imports remain until replay coverage proves
  the event-derived path is sufficient.
- Existing payload fields may remain only if they do not expose absolute local
  paths, usernames, tokens, secrets, raw prompts/completions, raw transcripts,
  stdout/stderr, diffs, patches, comments, or approval payload values.

## Consequences

This ADR blocks any implicit Forward promotion. It also makes existing bridge
mutations visible as command-surface debt rather than pretending the whole
bridge is read-only.

The promotion decision is closed for the current architecture cycle: Forward is
quarantined. A future promotion attempt requires a new ADR with evidence for all
eight gates, migration and rollback fixtures, and an explicit default-runtime
change. Until then, remaining bridge work reduces command-surface debt without
changing workspace authority.
