# Conitens Direction Deep Interview Prep

Date: `2026-07-05`
Mode: `ouroboros-interview` fallback, Socratic interviewer
Topic: Conitens direction after Gajae-Code harness integration and risk patch

## Interview Intent

This interview should clarify what Conitens is becoming, not collect another
feature wishlist. The central ambiguity is product identity:

- Is Conitens primarily an event-sourced agent control plane?
- Is it an operator cockpit for external terminal agents?
- Is it a local-first team operating system for AI work?
- Is it a replayable evidence and approval layer around many harnesses?

The interview should produce a decision-ready direction statement and a small
set of next architecture bets.

## Known Ground Truth

- Conitens authoritative state still enters through `append_event()` and the
  canonical event stream.
- `.notes/` remains a projection, not a write target for new modules.
- Gajae-Code is installed as an optional external terminal harness:
  `gjc/0.8.1`, plugin `gajae-code@gajae-code-local`, pinned local cache.
- GJC observations are metadata-only evidence through
  `harness.evidence_observed`; raw prompts, completions, transcripts, terminal
  output, commands, diffs, patches, comments, tokens, and secrets are rejected.
- The final risk patch fixed unsafe symbolic refs and unsafe stderr leakage.
  Symbolic refs such as `gjc:`, `event:`, `pr:`, and `ci:` are opaque IDs, not
  path carriers.
- Forward Bridge remains loopback-only, bearer-token protected, read-only for
  sensitive operator data.
- Focused mode should answer these in under three seconds:
  who is active, what is blocked, who owns the next handoff, and what the
  operator should do next.
- Recent OSS research suggests separating surfaces:
  primary graph/canvas or topology, adjacent inspector/run rail, and separate
  trace/log/evidence views. Spatial Lens should not carry every workflow
  semantic.

## Non-Negotiable Boundaries

- Do not create a second source of truth.
- Do not let terminal transcript scraping drive lifecycle state.
- Do not put raw logs, prompts, completions, or command bodies into Conitens
  control events.
- Do not let external harnesses mutate task, approval, `.notes`, or lifecycle
  state directly.
- Do not make pixel art carry critical task cards or approval semantics.
- Do not bypass validator or approval gates for convenience.

## Direction Tensions To Probe

1. Control Plane vs Cockpit
   - Control plane means Conitens owns state transitions, gates, replay, and
     projections.
   - Cockpit means Conitens mostly observes external agents and gives the
     operator a rich action surface.
   - Current implementation says control plane first, cockpit as projection.

2. Local-First Evidence vs Hosted Team Product
   - Current architecture is local-first, disk-backed, append-only, and
     restartable.
   - A hosted/team direction would force identity, auth, multi-user audit, and
     workspace isolation decisions earlier.

3. Focused Workbench vs Topology/Run Lens
   - Focused mode is already workbench-first.
   - Overview owns topology.
   - Logs, run trace, cost, validator evidence, and harness evidence may need a
     dedicated Run Lens rather than more panels inside Spatial Lens.

4. Approval-Heavy Safety vs Autonomous Throughput
   - Approval gates reduce risky drift and stale replay.
   - Too many gates can make Conitens feel like a bureaucracy around agents.
   - The key design question is where automatic retry ends and human ownership
     begins.

5. Harness Adapter Ecosystem vs One GJC Integration
   - GJC should probably prove a generic external harness contract.
   - The next adapter should not repeat one-off parsing and redaction logic.
   - But over-abstracting too early risks hiding security-sensitive edges.

## Recommended Interview Flow

### Round 1: Ontology

Goal: force a single primary product noun.

Question:
> I see Conitens has deliberately kept `append_event()` as authority while GJC
> is only harness evidence. Should I treat Conitens' core identity as a
> control plane that happens to observe terminal agents, or as an operator
> cockpit that may later coordinate many external harnesses?

Suggested choices:

- Control plane first: preserve strict event authority and make cockpit views
  projections.
- Cockpit first: optimize operator workflows and keep event authority as an
  implementation constraint.
- Evidence layer first: make replay, proof, and audit the product center.

### Round 2: Authority Boundary

Goal: confirm whether the GJC boundary is a permanent doctrine or a temporary
integration compromise.

Question:
> The latest GJC patch makes transcripts evidence-only and blocks direct task,
> approval, and `.notes` writes. Is this a permanent adapter rule for every
> external agent harness, or should a future "trusted harness" tier be allowed
> to request state transitions directly through a constrained API?

### Round 3: Operator Surface

Goal: decide whether to create a Run Lens / Trace Lens rather than overloading
Spatial Lens.

Question:
> Current research points away from stuffing DAGs, logs, terminal sessions, and
> trace cards into the office map. Should the next UI direction introduce a
> dedicated Run Lens for execution trace and evidence, leaving Focused mode as
> the active handoff workbench?

### Round 4: Autonomy Contract

Goal: define the product's stance on autonomous loops.

Question:
> When a run fails validation, where should Conitens draw the line between
> automatic retry/planner revision/specialist swap and explicit owner approval?

Probe dimensions:

- number of retries before human escalation
- which risky actions always require approval
- whether harness evidence can recommend but never execute operator actions
- how stale approvals are invalidated

### Round 5: Evidence And Logs

Goal: clarify log product value without weakening privacy/security.

Question:
> Should Conitens optimize logs as inspectable raw transcripts stored outside
> the control plane, or as redacted evidence summaries with stable refs and
> replayable receipts?

### Round 6: Architecture Bet

Goal: choose the next implementation tranche.

Question:
> Given the current state, which next architecture bet should be prioritized:
> generic external harness adapter contracts, a Run Lens / trace surface,
> workspace isolation, approval policy hardening, or retiring the remaining
> legacy-vs-forward runtime ambiguity?

### Round 7: User Promise

Goal: convert direction into a product-level promise.

Question:
> In one sentence, what should an operator trust Conitens to do better than a
> raw terminal, a tmux session, LangGraph Studio, or a generic agent dashboard?

## High-Signal Follow-Ups

- What should never be automated, even if technically possible?
- Which artifact should be admissible as proof after a run: event, screenshot,
  transcript ref, validator result, approval receipt, or all of them?
- Does "room" mean collaboration UI, audit replay, or execution planning?
- Does "agent" mean persona, process, terminal session, harness, or role in a
  workflow?
- Is the pixel office a primary product metaphor or a friendly skin over a
  stricter run-control system?
- What would make Conitens feel safe enough for long-running autonomous work?
- What would make it feel too slow or ceremonial?

## Interviewer Guardrails

- Ask confirmation questions from known facts; do not ask discovery questions
  already answered by the repo.
- End every live interview turn with exactly one focused question.
- Keep implementation out of the interview. Capture choices, tradeoffs, and
  definitions.
- Target category mistakes first: state vs evidence, harness vs agent, room vs
  execution, log vs receipt, approval vs validation.
- If the user answers with a feature idea, translate it back into the direction
  it implies before asking the next question.

## Prepared Opening

I found that Conitens is already behaving like an event-sourced control plane:
GJC is installed and visible, but it can only contribute redacted evidence via
`harness.evidence_observed`, while Focused mode remains a handoff workbench and
not a terminal/log surface.

First question:
> Should the next direction explicitly double down on "Conitens as the
> authority-preserving control plane for external agents", or should it shift
> toward "Conitens as the operator cockpit that supervises many agent
> harnesses" even if that makes the control-plane boundary more product-hidden?
