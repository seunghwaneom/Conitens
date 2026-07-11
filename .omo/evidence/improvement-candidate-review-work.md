# Improvement candidate review-work closure

Date: 2026-07-10
Scope: closure artifact to typed/versioned candidate, deterministic risk, and
event-derived approval/rejection only.

## Review lanes

- Code review initially found one medium replay-integrity issue: numeric
  candidate fields were coerced to text and could influence versioning. A
  failure-first regression reproduced it; strict string replay validation fixed
  it. Final rereview returned APPROVE with zero findings.
- Security review initially identified approval actor spoofing and forged
  provenance acceptance. Exact actor types and closure provenance re-resolution
  were added. Final rereview after the numeric/type hardening returned an
  unconditional scoped PASS.
- Test review returned PASS. Its optional explicit wrong
  `approval.requested` actor scenario was added and passes.

## Boundary confirmation

- Candidate and approval state is rebuilt only from events.
- Public list is bounded L0; show is bounded L2; raw access is absent.
- No `.agent`, SQLite, Forward, dashboard, or default-runtime mutation exists.
- Generic SQLite-first approval infrastructure was not reused.
- No new dependency was added.

## Residual risks for the next slice

- Full-ledger scans have an unmeasured scale/performance cost.
- Concurrent proposals for the same lineage are not serialized and could race
  monotonic version allocation.
- Actor shape validation is structural, not cryptographic authorization.
- Approved candidates currently contain metadata summaries, not materializable
  revision content. Apply/rollback must not be implemented by inventing content
  from summaries; the next Ralph slice must define a bounded revision body or
  content-addressed artifact reference and a real owner authorization boundary.
