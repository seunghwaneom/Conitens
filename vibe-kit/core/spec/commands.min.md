# CLI Commands Minimum Specification

> **Purpose**: Define standard CLI commands and exit codes for vibe-kit
> 
> **Principle**: Fast loop (precommit) vs Full scan (doctor) separation

---

## Command Overview

| Command | Scope | Speed | Purpose |
|---------|-------|-------|---------|
| `vibe precommit` | Staged files only | Fast (<5s) | Pre-commit gate |
| `vibe doctor` | Full project | Slow | Comprehensive scan |
| `vibe status` | Config check | Instant | Verify setup |

---

## Exit Code Specification

### Universal Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Proceed |
| 1 | Gate failed / Issue found | Block (precommit) or Review (doctor) |
| 2 | Configuration / Execution error | Fix setup |

### Per-Command Details

#### `vibe precommit`

```
Exit 0: All gates passed
Exit 1: Gate failed (baseline increase, cycle detected, etc.)
Exit 2: Config error (missing .vibe/, invalid config.json)
```

**Behavior**:
- MUST check staged files only (fast)
- MUST run baseline gate
- MUST run cycle check (if enabled)
- SHOULD run complexity check (warn only, no block)

#### `vibe doctor`

```
Exit 0: Full scan complete, no critical issues
Exit 1: Critical issues found (see SEVERITY)
Exit 2: Execution error
```

**Behavior**:
- MUST scan entire project
- MUST generate full report
- MUST update LATEST_CONTEXT.md
- MAY run optional modules (--profile, --arch, --upstream)

#### `vibe status`

```
Exit 0: vibe-kit configured correctly
Exit 2: Configuration error
```

**Behavior**:
- Check .vibe/ directory exists
- Validate config.json against schema
- Report version and pack info

---

## Severity Levels (doctor output)

### Definition

| Level | Meaning | Exit Code Impact |
|-------|---------|------------------|
| `INFO` | Informational | No impact |
| `WARN` | Warning, review recommended | Exit 0 (default) |
| `FAIL` | Critical issue | Exit 1 |

### Output Format

```
[SEVERITY] {category}: {message}
  → {file}:{line} (if applicable)
  → Suggestion: {fix suggestion}
```

### Example

```
[WARN] complexity: Function exceeds threshold (22 > 15)
  → src/ensemble.py:1234
  → Suggestion: Consider extracting helper functions

[FAIL] cycle: Circular dependency detected
  → src/a.py → src/b.py → src/a.py
  → Suggestion: Extract shared interface to break cycle
```

---

## Optional Flags

### `vibe doctor` Options

| Flag | Description |
|------|-------------|
| `--full` | Run all checks (default) |
| `--strict` | Exit 1 on any WARN (not just FAIL) |
| `--profile` | Include performance profiling |
| `--arch` | Include architecture analysis |
| `--upstream` | Check for vibe-kit updates |

### `vibe precommit` Options

| Flag | Description |
|------|-------------|
| `--no-baseline` | Skip baseline gate |
| `--no-cycle` | Skip cycle check |

---

## Language Pack Implementation

Each pack must implement:

1. `precommit.py` — Staged-only fast check
2. `doctor.py` — Full project scan
3. Both must respect exit code spec
4. Both must output severity-tagged messages

---

## Integration with Git Hooks

### Recommended Hook (pre-commit)

```bash
#!/bin/bash
python .vibe/brain/precommit.py
exit $?
```

### Installation

```bash
vibe install-hooks
# Creates .git/hooks/pre-commit
```

---

*vibe-kit core spec v1.0*
