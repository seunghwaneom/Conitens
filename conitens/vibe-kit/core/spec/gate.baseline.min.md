# Baseline Gate Minimum Specification

> **Purpose**: Define baseline gate interface for all language packs
> 
> **Philosophy**: "Don't fix all errors — just don't add more"

---

## Core Principle

```
┌─────────────────────────────────────────────────────────────────────┐
│  BASELINE GATE = "Error count increase blocker"                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  current_count > baseline_count  →  FAIL (exit 1)                  │
│  current_count <= baseline_count →  PASS (exit 0)                  │
│                                                                     │
│  This is NOT about fixing all errors.                              │
│  This is about NOT making things worse.                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Input/Output Interface

### Input

```
Tool execution result from:
- Typecheck (pyright, mypy, tsc, etc.)
- Linter (ruff, eslint, mlint, etc.)
- Any tool that produces enumerable errors
```

### Output (Baseline File)

```json
{
  "tool": "pyright",
  "version": "1.x.x",
  "timestamp": "2026-02-01T12:00:00Z",
  "error_count": 42,
  "fingerprints": [
    "a1b2c3d4e5f6g7h8",
    "b2c3d4e5f6g7h8i9"
  ]
}
```

---

## Fingerprint Specification

### Purpose

Fingerprints enable:
- Duplicate detection across runs
- Stable error identification (survives line number shifts)

### Generation Rule

```
fingerprint = sha256(normalized_error_line)[:16]
```

### Normalization (RECOMMENDED)

| Step | Before | After |
|------|--------|-------|
| 1. Path relative | `/home/user/project/src/api.py` | `src/api.py` |
| 2. Whitespace trim | `  error at line 42  ` | `error at line 42` |
| 3. Line number strip | `src/api.py:42:5: error` | `src/api.py:error` |
| 4. Lowercase | `TypeError: ...` | `typeerror: ...` |

### Implementation Note

Exact normalization is pack's discretion, but:
- MUST be deterministic
- SHOULD survive minor refactoring (line shifts)
- SHOULD be documented in pack's README

---

## Baseline Workflow

### Initial Setup

```bash
# First run: capture baseline
vibe baseline --init
# Creates: .vibe/baselines/{tool}_baseline.json
```

### Pre-commit Check

```bash
# Compare current vs baseline
vibe precommit
# Exit 1 if current_count > baseline_count
```

### Baseline Update (Explicit)

```bash
# After fixing errors, update baseline
vibe baseline --update
# Requires explicit action (not automatic)
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Pass (no increase) |
| 1 | Fail (error count increased) |
| 2 | Configuration/execution error |

---

## Language Pack Implementation

Each pack's `gate_{tool}.py` must:

1. Execute the tool and capture output
2. Parse errors into count + fingerprints
3. Compare against baseline file
4. Return appropriate exit code
5. Output human-readable diff summary

---

*vibe-kit core spec v1.0*
