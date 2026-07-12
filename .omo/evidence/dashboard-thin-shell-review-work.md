# Dashboard thin-shell review-work closure

Date: 2026-07-10

## Scope

Facade-preserving extraction of operator-workspace orchestration from
`packages/dashboard/src/App.tsx` into a small feature boundary. No route,
bridge payload, CSS, backend, dependency, or Forward runtime change.

## Review loop

### First review findings

1. The initial controller hook was 323 pure LOC and mixed resource, draft, and
   mutation responsibilities.
2. The first regression lock asserted source movement rather than runtime
   command behavior.
3. Moving the hook too early in `App` risked changing observable effect
   registration/request order.
4. The workspace list route passed the detail error string, and selected state
   was visual-only.

### Repairs

- Split resources, injectable command service, and composing controller into
  178/133/154-pure-LOC modules.
- Added runtime tests for create/update/detach/archive bridge calls, feedback
  transitions, refresh order, and the archive-rationale guard.
- Registered the workspace controller immediately after the task-list effect,
  preserving the prior task-list-before-workspace request order.
- Routed `workspacesError` on the list route and used one
  `isWorkspaceSelected` predicate for `active` plus `aria-pressed`.

## Fresh verification

- Targeted workspace tests: 4 passed, 0 failed.
- Full dashboard suite: 154 passed, 0 failed.
- TypeScript no-emit check: pass.
- Production build: pass, 146 modules transformed.
- Scoped diff check: pass; only the existing App.tsx LF/CRLF warning.
- Post-write structure audit: zero dependency cycles.
- Browser QA: actual workspace-button navigation, one-row nav at 1220px, no
  1220px/820px horizontal overflow, one semantic selection, no console
  warnings/errors.

## Independent final verdicts

- Code/spec/security: APPROVE, zero findings.
- Test adequacy: PASS, no blocking coverage gap.
- Operator UI/accessibility: PASS, no confirmed operator-facing defect.

The workspace slice is closed. Broader App decomposition remains an incremental
future lane; this patch does not claim the entire 2,496-line shell is finished.
