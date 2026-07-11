# Wave 3 Forward Bridge debugging audit

Date: 2026-07-11 (Asia/Seoul)
Verdict: PASS for the Wave 3 slice; adjacent legacy failures remain classified.

## Runtime evidence and hypotheses

1. **CONFIRMED — read-only SQLite sidecars.** A first SELECT against a quiescent
   WAL database created WAL/SHM files. Opening existing databases by URI and using
   `immutable=1` only when no WAL/SHM exists changed the sidecar regression from
   red to green while an absent database stayed entirely unmaterialized.

2. **CONFIRMED — import-time notes path contamination.** The candidate patch
   event index captured `NOTES_DIR` at import time, so a real-repository proposal
   contaminated a temporary-workspace retry test. Resolving the notes directory
   at call time changed the two failures to 13/13 related state-machine tests and
   the complete Wave 3 suite passed.

3. **CONFIRMED — raw-message search oracle.** Thread search matched private event
   and legacy message bodies even though detail output hid content. Restricting
   search to public thread metadata changed the privacy regression to green; live
   QA returned 0 for the raw term and 1 for public metadata.

4. **CONFIRMED — Windows 413 connection reset.** The server returned 413 without
   consuming a slightly over-limit request body, so one of three reproductions
   reached the client as `ConnectionAbortedError`. A bounded drain for only
   slightly oversized bodies produced ten consecutive live 413 responses and the
   complete 158-test suite passed. Extreme declared lengths remain undrained and
   are rejected by a dedicated test.

5. **REFUTED AS PRODUCT FAILURE — SSE observation timeout.** Curl exit 28 occurred
   only because the client ended a two-second observation window. Snapshot and
   heartbeat frames arrived, disconnect cleanup completed, and no listener
   remained.

6. **CONFIRMED ADJACENT BASELINE — legacy event/schema drift.** The 51-test
   adjacent suite still reports 2 failures and 9 errors. Runtime/module-origin
   probes refuted a stale module tree. Process-local event-alias and temporary
   manifest-field toggles isolated legacy uppercase event names and three legacy
   persona manifests missing `schema_v`, `agent_id`, and `runtime`. These paths do
   not import Forward Bridge modules and persona-core migration is outside scope.

7. **CONFIRMED — duplicated public projection drift.** Handoff queries, SSE
   snapshots, and workspace command responses each carried independently shaped
   actor or handoff data, allowing secret-shaped actors and raw handoff fields to
   cross selected public paths. A single allowlisted public projection module plus
   direct query/SSE/command regressions changed every reproducer to sanitized
   actors, neutral summaries, empty packet payloads, and null unsafe owners.

8. **CONFIRMED — wildcard query dependency chain.** Eighteen query modules relied
   on star imports and dynamic `globals()` exports, hiding true dependencies and
   making boundary review unreliable. Direct owner-module imports, a 27-name
   explicit facade, and an architecture regression removed every wildcard and
   dynamic export without changing the public API.

9. **CONFIRMED — partial root command inventory.** The bridge root described only
   part of the mutation surface even though all routes were live. An exhaustive
   regression enumerating all 13 authenticated operator mutation routes failed
   before the documentation repair and passed afterward.

## Debugging gate

More than three competing runtime hypotheses were discriminated with observable
toggle evidence. No Python language server is installed (42 configurations were
discoverable, zero servers installed), so no dependency was added; executable
substitutes were `py_compile`, the scoped no-excuse checker, focused/full tests,
live loopback QA, repeated stress requests, and diff validation.

The temporary `.debug-journal.md` was promoted into this artifact and removed.
