# Episode Closure Attempt Manual QA

Date: 2026-07-05
Surface: real `ensemble_events.py` and `ensemble.py` CLI commands in a temporary workspace

## Scenario

Commands executed against a temporary workspace:

```text
tmp=$(mktemp -d)
python scripts/ensemble_events.py --workspace "$tmp" append --type task.created --actor-name manual --payload '{"episode_id":"ep-manual","summary":"manual seed"}'
python scripts/ensemble.py --workspace "$tmp" episode close ep-manual --summary 'Manual blocked closure attempt.' --goal 'Manual closure QA'
python scripts/ensemble.py --workspace "$tmp" improvement list
python scripts/ensemble_events.py --workspace "$tmp" append --type validation.passed --actor-name verifier --payload '{"episode_id":"ep-manual","validator":"manual"}'
python scripts/ensemble.py --workspace "$tmp" episode close ep-manual --summary 'Manual closed closure attempt.' --goal 'Manual closure QA'
python scripts/ensemble.py --workspace "$tmp" improvement list
artifact=$(python scripts/ensemble.py --workspace "$tmp" improvement list | tail -n 1 | cut -f 1)
python scripts/ensemble.py --workspace "$tmp" improvement show "$artifact"
```

## Observed Results

First closure attempt:

```text
Closure attempt created: closure-ep-manual-8361931e-4df9dcff
Status: blocked
Episode remains open or review-pending.
```

L0 list after blocked attempt:

```text
artifact_id	status	risk	episode_id	summary
closure-ep-manual-8361931e-4df9dcff	blocked	medium	ep-manual	Manual blocked closure attempt.
```

Second closure attempt after `validation.passed`:

```text
Closure attempt created: closure-ep-manual-8361931e-58bd1bcf
Status: closed
Episode projection: closed
```

L1 digest excerpt:

```text
# Episode ep-manual Closure Attempt

## Status
Closed

## Summary
Manual closed closure attempt.

## Scorecard
- Goal satisfied: yes
- Validation passed: yes
- Closure allowed: yes
- Confidence: medium

## Raw Access
No L3 raw access used.
```

## Verdict

The real CLI creates an audit-visible closure artifact for blocked and closed paths, appends L0 index rows, and renders the L1 digest through `improvement show`.
