# Mocking Policy

Status: `settled for FE-0`

## Rule

BE-1a and FE-1 must use the real forward bridge by default.

## Allowed mocks

Typed fixture payloads are allowed only for:

- parser tests
- route/view-model unit tests

Those mocks live in:

- `packages/dashboard/tests/forward-bridge.test.mjs`

## Disallowed mocks

- no fake backend logic in the running app
- no fake run list in FE-1
- no fake replay timeline in FE-1

If the bridge is unavailable, FE-1 should show connection/setup states rather
than silently falling back to demo data.
