# GJC Harness Adapter Contract

Conitens remains the event-sourced control plane. Gajae-Code (GJC) is installed as an optional external terminal harness and is never a second source of truth for task lifecycle, approval state, or `.notes` projections.

## Authority Boundary

- Authoritative state transitions still enter through `append_event()` and the canonical `events/*.jsonl` stream.
- GJC transcript and terminal output are evidence, not state. The bridge imports only metadata, bounded redacted summaries, and evidence references.
- GJC must not write `.notes/`, approval state, task status, retry decisions, or handoff lifecycle records directly.
- The Forward Bridge exposes GJC availability and observations as read-only operator projections.

## Log Taxonomy

- `control events`: Conitens state transitions emitted through `append_event()`.
- `approval audit`: approval request and reviewer decision history.
- `validator evidence`: validation outcomes and issue metadata.
- `terminal stdout/stderr`: raw terminal output, stored outside Conitens state unless separately summarized.
- `GJC transcript`: raw GJC prompt/completion/session body, stored outside Conitens state.
- `cost telemetry`: provider call metadata, token counts, latency, and estimated cost.

## Accepted Harness Evidence

Use `harness.evidence_observed` for metadata-only imports:

- `harness`, `runtime`, `status`, `harness_version`
- `run_id`, `iteration_id`, `task_id`, `observed_at`
- `redaction_status`, `transcript_ref`, `summary`
- `evidence_refs`

The bridge normalizes `gajae-code`, `gajaecode`, and `gjc` to the runtime id `gjc`.

## Adapter Import Surface

The leaf adapter is `scripts/ensemble_gjc_adapter.py`. It imports one redacted
GJC run metadata JSON file and appends exactly one `harness.evidence_observed`
event:

```powershell
python scripts/ensemble_gjc_adapter.py --workspace <workspace> import-run --input <metadata.json> --format json
```

The adapter accepts only the harness evidence fields above, defaults
`harness` to `gajae-code`, defaults `runtime` to `gjc`, canonicalizes relative
evidence paths into `artifact:<relative-path>`, and rejects absolute paths or
`..` traversal before calling `append_event()`. Symbolic refs such as
`gjc:run:gjc-run-001`, `event:<id>`, `pr:<id>`, and `ci:<id>` are treated as
opaque IDs rather than paths; they must not contain slashes, backslashes,
drive-letter syntax, or traversal markers.

## Rejected Harness Payload

`append_event()` rejects raw harness content fields before any event is written:

- prompt/completion/request/response
- stdout/stderr/output/terminal output
- transcript/raw transcript
- log/content/body/diff/patch/comment
- command/token/auth token/secret

This blocks raw transcript exposure, stale approval replay via copied command strings, and accidental secret leakage in the control-plane event stream.

## Threat Model Gates

- Command injection: harness events are metadata-only and do not execute commands.
- Path traversal: adapter import rejects absolute/traversal evidence refs, and
  bridge projection still drops absolute local evidence paths.
- Secret leakage: event redaction still applies, and raw content keys are rejected.
- Supply-chain drift: standalone GJC and Codex plugin are pinned to an upstream tag before install.
- Raw transcript exposure: bridge summary returns `raw_transcript_exposed: false`; raw body fields are rejected at append time.
- Stale approval replay: GJC observations cannot mutate approval or lifecycle state.
