# Agent skill revision runtime debugging audit

Date: 2026-07-10

## Hypothesis 1: authority commits but projection fails

Expected failure mode: `improvement.revision_applied` or
`improvement.revision_rolled_back` remains authoritative while `os.replace()`
fails, so a later owner-authorized rebuild must recover without a duplicate
terminal event.

Runtime evidence:

- focused tests force replace failure after terminal append and verify one
  terminal event, unchanged/non-partial target bytes, no stale temp file, and
  successful rebuild;
- the manual CLI scenario deleted the projection after rollback and
  `revision-rebuild` restored the canonical base bytes;
- an ownerless event-only rebuild was reproduced as a security RED and now fails
  before creating `.agent`.

Verdict: confirmed recoverable; ownerless recovery is denied.

## Hypothesis 2: concurrent processes duplicate or reorder authority

Expected failure mode: two processes could append duplicate grants/terminals or
allow two conflicting revisions based on the same source.

Runtime evidence:

- the permanent cross-process CLI test ran two independent Python processes on
  one revision and observed two successful idempotent responses but one terminal
  apply event;
- the manual conflicting-process probe observed exit codes `[0, 1]`, one terminal
  event, and final bytes matching the winner;
- replay tests reject duplicate grants, duplicate terminals, conflicting commit
  order, and stale active-stack rollback.

Verdict: serialized and fail-closed for cooperating callers.

## Hypothesis 3: external drift or path corruption is overwritten silently

Expected failure mode: a symlink/junction, post-replace corruption, arbitrary
external edit, or unsafe input could redirect or conceal a write.

Runtime evidence:

- focused tests reject target and parent symlinks, stale source hashes, arbitrary
  projection drift on retry, and corruption injected after `os.replace()`;
- post-write verification detects mismatched target bytes;
- the real CLI bad-input scenario returned code 1 and redacted the secret, local
  path, workspace path, input filename, and traceback;
- registry validation remained 8 manifests, 0 errors, 0 warnings.

Verdict: fail-closed within the documented local/cooperating-process boundary.

Residual runtime risks: legacy owner matching still permits the existing git-email
fallback; processes deliberately using different temp directories can bypass the
shared temp lock; and the global event writer does not add crash-level fsync in
this slice. These are documented future hardening items, not hidden GREEN claims.
