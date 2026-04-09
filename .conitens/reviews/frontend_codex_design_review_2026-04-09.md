# Frontend Codex Design Review

> Date: 2026-04-09
> Scope: `packages/dashboard`
> Mode: read-only review

## Official reference

- OpenAI Codex use case: `Build responsive front-end designs`
  - source: <https://developers.openai.com/codex/use-cases>
  - current summary: turn screenshots and visual references into responsive UI
    with visual checks
- OpenAI frontend guide: `Designing delightful frontends with GPT-5.4`
  - source: <https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4>
  - app-UI guidance used here:
    - prioritize orientation, status, and action over mood or hero copy
    - start with the working surface itself
    - do not keep sections that do not help an operator operate, monitor, or
      decide
    - avoid app UI that turns into stacked cards instead of clear layout

## Browser evidence

- Local review server:
  - `python3 -m http.server 4291 -d packages/dashboard/dist`
- Playwright screenshots:
  - `output/playwright/dashboard-overview-20260409-1440.png`
  - `output/playwright/dashboard-inbox-20260409-1440.png`
  - `output/playwright/dashboard-tasks-20260409-1440.png`
  - `output/playwright/dashboard-runs-20260409-1440.png`
  - `output/playwright/dashboard-office-preview-20260409-1440.png`
  - `output/playwright/dashboard-overview-20260409-820.png`
  - `output/playwright/dashboard-office-preview-20260409-820.png`
- Playwright console check:
  - `0` errors, `0` warnings during capture

## Findings

### High

1. Header navigation is still overloaded for a control-plane app.
   - Evidence: every reviewed route starts with 9 primary chips, 3 utility
     chips, and API/token meta before the working surface is visible.
   - Code:
     - `packages/dashboard/src/App.tsx`
     - `packages/dashboard/src/styles/forward-shell.css`
   - Effect:
     - operators scan navigation chrome before they reach state, queue, or
       action content
     - mobile and narrow widths compress the shell into tiny chips rather than
       simplifying the decision surface

2. Multiple routes still inherit the same left-list-plus-detail shell even
   when the object of work changes.
   - Evidence:
     - `tasks`, `workspaces`, and `runs` all reuse the same structural shell
       and keep the left pane visually dominant
     - `TasksScreen` is only a thin wrapper over `ForwardDashboardScreen`
   - Code:
     - `packages/dashboard/src/screens/TasksScreen.tsx`
     - `packages/dashboard/src/screens/ForwardDashboardScreen.tsx`
     - `packages/dashboard/src/styles/live-panels.css`
   - Effect:
     - task and workspace routes feel like relabelled run detail instead of
       first-class operator workflows
     - important task/workspace actions lose visual priority

### Medium

3. Demo onboarding, demo banner, and connect form still consume the top of the
   page before the operator surface.
   - Evidence:
     - overview and runs place onboarding plus demo messaging above the actual
       data surface
   - Code:
     - `packages/dashboard/src/screens/ForwardDashboardScreen.tsx`
     - `packages/dashboard/src/styles/forward-shell.css`
   - Effect:
     - the product explains itself before it proves itself
     - this conflicts with the OpenAI guidance for app UI to start with the
       working surface

4. The spatial lens is stronger on desktop than on mobile, but it collapses
   into a long scroll of six stacked rooms on small screens.
   - Evidence:
     - `dashboard-office-preview-20260409-820.png` becomes a tall room stack
       before the active-agents / task-queue rail is reached
   - Code:
     - `packages/dashboard/src/office.module.css`
     - `packages/dashboard/src/office-stage.module.css`
   - Effect:
     - spatial context survives, but operator decision density drops sharply on
       narrower viewports

5. Overview is visually more coherent than the task/workspace surfaces, but it
   still splits attention between command rail, command center, and lower
   panels.
   - Evidence:
     - overview uses a 3-column grid plus a second 2-column grid
   - Code:
     - `packages/dashboard/src/components/OverviewDashboard.tsx`
     - `packages/dashboard/src/components/OverviewDashboard.module.css`
   - Effect:
     - the "status-first" promise is right, but the first screen is still
       scan-heavy instead of instantly decisive

## Recommended direction

### Visual thesis

Treat Conitens as an operator workspace first: one dominant decision surface,
one secondary queue rail, and one specialized spatial drill-down. Keep the dark
shell, but reduce chrome and let the active route define the page instead of
forcing every route through the same shared framing.

### High-leverage changes

1. Collapse the global header into a tighter route switcher.
   - Keep `Overview`, `Inbox`, `Tasks`, `Runs`.
   - Demote `Workspaces`, `Agents`, `Threads`, `Approvals`, and utilities into
     a secondary menu or view switcher.

2. Make each primary route structurally distinct.
   - `Overview`: posture + urgent actions.
   - `Inbox`: action queue.
   - `Tasks`: canonical work queue with filters and transitions.
   - `Runs`: evidence browser, not the default skeleton for everything else.

3. Move demo/connect education below or beside the main working surface.
   - Keep the bridge-connect path, but stop giving it first-screen priority on
     every route.

4. Reframe `Spatial Lens` as a drill-down, not a peer to the core queue routes.
   - Desktop: preserve it as a dense monitoring view.
   - Mobile: replace the full floor map with a summarized room strip plus a
     selective room-detail entry path.

5. Reduce card-within-card repetition.
   - Preserve the dark system and panel grammar, but remove unnecessary
     secondary boxes where a list row or inline metric will do.

### Route priority

1. `overview`
2. `inbox`
3. `tasks`
4. `runs`
5. `spatial lens`

`workspaces`, `agents`, `threads`, and `approvals` should support the operator
loop, but they should not all compete at the same visual level in the global
header.

### Keep

- the dark control-plane palette
- the stronger overview/status-first posture
- the spatial lens concept itself
- the office-preview restraint improvements already landed
- the route-specific copy that is mostly utility-focused rather than
  marketing-style
