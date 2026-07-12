# Dashboard thin-shell browser QA

Date: 2026-07-10

## Build under test

- Production build: `pnpm --filter @conitens/dashboard build`
- Result: pass; TypeScript build plus Vite production build transformed 146 modules.
- Static preview: fresh `packages/dashboard/dist` served on loopback only for this QA run, then stopped.

## 1220 x 1000 workspace list

- Route: `?office-preview=1#/workspaces`
- All eight top-navigation links had the same top coordinate (`49px`), so the nav remained on one row.
- `document.body`: `clientWidth=1205`, `scrollWidth=1205`.
- `document.documentElement`: `clientWidth=1205`, `scrollWidth=1205`.
- Exactly one workspace button exposed `aria-pressed="true"`, `type="button"`, and the same `forward-run-item active` visual predicate.
- Clicking that unique selected workspace button navigated to `#/workspaces/demo-workspace`.
- Screenshot: `workspaces-1220x1000-final.png`.

## 820 x 1000 workspace detail

- Route: `?office-preview=1#/workspaces/demo-workspace`
- `document.body`: `clientWidth=805`, `scrollWidth=805`.
- `document.documentElement`: `clientWidth=805`, `scrollWidth=805`.
- Exactly one workspace remained semantically selected.
- Both `Operator workspace list` and `Operator workspace detail` headings remained visible in the rendered DOM.
- Screenshot: `workspace-detail-820x1000-final.png`.

## Diagnostics

- Browser console warnings/errors: none.
- Horizontal overflow: none at either viewport.
- A malformed browser capture created during the run was removed and is not evidence.
