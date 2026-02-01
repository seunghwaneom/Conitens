# LATEST_CONTEXT Minimum Specification

> **Purpose**: Define required sections for LATEST_CONTEXT.md across all language packs
> 
> **Rule**: REQUIRED sections MUST have headers even if empty (parser stability)

---

## Section Requirements

| Section | Status | Description |
|---------|--------|-------------|
| `[1] Recent Changes` | **REQUIRED** | Recently modified files with change summary |
| `[2] Critical Items` | **REQUIRED** | Items tagged @critical or equivalent |
| `[3] Warnings` | **REQUIRED** | Typecheck/lint status, cycles, complexity |
| `[4] Hotspots` | OPTIONAL | High fan-in files, change frequency |
| `[5] Next Actions` | OPTIONAL | Recommended actions for agent |

---

## Template Structure

```markdown
# LATEST_CONTEXT

> Generated: {ISO_TIMESTAMP}
> Pack: {language_pack_name}

## [1] Recent Changes

{content or "No recent changes."}

## [2] Critical Items

{content or "No critical items."}

## [3] Warnings

{content or "No warnings."}

## [4] Hotspots

{content or section may be omitted}

## [5] Next Actions

{content or section may be omitted}
```

---

## Parser Stability Rules

1. **Header Format**: `## [N] Section Name` (exact format)
2. **Empty Sections**: REQUIRED sections MUST have header + placeholder text
3. **Ordering**: Sections MUST appear in numerical order (1, 2, 3, ...)
4. **Encoding**: UTF-8 only

---

## Language Pack Implementation

Each language pack's `summarizer` module must:

1. Generate all REQUIRED sections (even if empty)
2. Use exact header format
3. Include timestamp and pack identifier in header block
4. Output to path specified in `config.context.latest_file`

---

*vibe-kit core spec v1.0*
