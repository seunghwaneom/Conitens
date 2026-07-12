# PR #33 Conflict Resolution Debugging Audit

Date: 2026-07-12

## Hypothesis 1: History divergence, not an isolated line conflict, made the PR unmergeable

Confirmed. `origin/main` and the original PR head diverged by 13 and 18 commits.
History and tree analysis showed that the cleanup intent was superseded by a
broader cleanup record already on `main`, while five commits carried PR-specific
episode-closure, control-plane, agent-role, evidence, and hardening intent.
Replaying only those five commits onto current `main` reproduced the real
integration conflicts without duplicating superseded cleanup history.

## Hypothesis 2: Choosing the PR side wholesale would regress the dashboard thin shell

Confirmed. The PR-side `App.tsx` predated the extracted screen and hook boundaries
on `main`. The resolution kept `App.tsx` as the composition shell, composed
`useOperatorWorkspaceController`, and moved workspace selection and list-error
semantics into `OperatorWorkbenchScreen.tsx`. Dashboard tests pass 154/154 and the
TypeScript/Vite production build passes.

## Hypothesis 3: A two-parent commit can preserve both public histories without a force push

Confirmed by graph inspection. The final commit will use the original PR head as
first parent and current `origin/main` as second parent, with the verified
integration tree. The result is a descendant of the public PR head and can update
`codex/episode-closure-attempt` by fast-forward while also making `main` reachable.

## Runtime evidence

- Integrated Python bundle: 213/213 passed.
- Dashboard before review: 154/154 passed; after the stale-detail regression and
  fix: 155/155 passed; production build passed.
- Protocol changed slice: 1/1 passed; protocol build passed.
- Full protocol suite reproduced the documented baseline: 847 passed, 4 failed.
- `python -m compileall -q scripts` passed.
- `git diff --check origin/main..HEAD` passed.
- Browser QA at 1220x1000 showed one-row navigation, Active Handoff Workbench
  before spatial/character context, explicit blocked and next-action text, and no
  console errors.
- Selecting Demo workspace navigated to `#/workspaces/demo-workspace`, retained
  `aria-pressed=true`, rendered the detail, and produced no console errors.
- A failure-first regression reproduced a stale workspace-1 draft being submitted
  to workspace-2 during route transition. The command boundary now rejects the
  mismatch, resources clear stale projections, and the UI hides edit/actions until
  route and loaded-detail IDs match.
