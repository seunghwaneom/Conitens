# Debugging audit — effect observation final blockers

Date: 2026-07-11
Method: reproduce, isolate competing hypotheses, add RED regressions, apply the
smallest repair, rerun adjacent suites, then remove temporary instrumentation.

## Runtime-roster timeout

Observed failure: the authenticated HTTP runtime-roster exceeded the test
client's 10-second deadline.

Hypotheses:

1. Confirmed: the HTTP route's default version probing synchronously expanded
   request latency. Direct evidence was 0.074095s with probes disabled and
   12.526197s with 12 probe calls enabled.
2. Refuted: one configured command always exhausted its individual timeout.
   The configured-probe pass completed in about 2206.7ms; several Windows
   extensionless shims failed quickly instead of stalling.
3. Refuted: the initial 403 or HTTP scheduling blocked the authenticated
   request. With probes disabled, the authenticated response completed in
   roughly 79-95ms after the 403 path.

Root cause: optional external diagnostics were on the default read request's
critical path and their aggregate latency was host-dependent.

Repair:

- `/api/operator/runtime-roster` now defaults `probe_versions` to false.
- `probe_versions=1` remains an explicit opt-in.
- Route-level tests replace external probes with deterministic fakes and assert
  the default false / explicit true contract.
- Full Forward runtime + bridge verification passes 54/54.

Rejected alternatives:

- Parallel/cache probes: larger concurrency and invalidation surface in a
  quarantined sidecar.
- Increase the HTTP timeout: hides the critical-path defect.
- Remove probes entirely: unnecessary compatibility break; explicit opt-in is
  still useful.

## Closure public-policy mismatch

Observed failure: closure creation could publish an absolute POSIX path, while
effect replay correctly rejected the same closure as malformed.

Root cause: closure creation used legacy Windows-path redaction but did not
apply the shared bounded public-text policy.

Repair:

- Public closure prose is validated with the shared policy after legacy
  redaction and fails before append on absolute POSIX paths.
- Unsafe or redacted episode IDs retain compatibility by publishing only a
  deterministic `episode-sha256:` reference.
- API tests cover every public prose field and opaque POSIX episode IDs; CLI
  tests cover generic no-leak/no-write failure.
- Closure security verification passes 19/19; effect verification passes 26/26.

## Cleanup

- No debug prints, timing hooks, monkeypatches, or temporary drivers remain in
  production code.
- The temporary debug journal and its local exclude entry were removed after
  this audit captured the useful evidence.
