# Improvement candidate debugging audit

Date: 2026-07-10

## Hypothesis 1 - append failure leaks or corrupts derived state

Runtime probes forced a missing approval-request append and a failed terminal
decision append. Retry repaired exactly one request without duplicating the
candidate, while failed decision append left the candidate pending.

Result: 2/2 tests passed.

## Hypothesis 2 - unrelated or forged approval events can decide a candidate

Runtime probes injected approval before proposal, wrong scope/request metadata,
and wrong actor types. Replay ignored every forged event and required the exact
post-proposal request before accepting a terminal decision.

Result: 3/3 tests passed.

## Hypothesis 3 - private, forged, or non-string replay content can cross the public boundary

Runtime probes exercised unsafe closure provenance, forged candidate
provenance/private text, raw/path/secret-shaped proposal inputs, and numeric
candidate fields with otherwise consistent identity/digest data. Each failed
closed; malformed versions did not advance the next valid version.

Result: 4/4 tests passed.

No hypothesis reproduced a remaining defect after the final fixes.
