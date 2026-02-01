# vibe-kit

> Agent-friendly development environment toolkit

## Overview

vibe-kit provides a structured environment for AI agents to work safely and efficiently on codebases. It reduces cognitive load by providing:

- **Indexed structure**: SQLite-based search over code symbols
- **Baseline gates**: Block error count increases, not fix all errors
- **Fast loops**: Pre-commit checks staged files only
- **Context summary**: LATEST_CONTEXT.md for quick orientation

## Structure

```
vibe-kit/
├── core/
│   └── spec/           # Language-agnostic specifications
│       ├── config.schema.min.json
│       ├── latest_context.min.md
│       ├── gate.baseline.min.md
│       └── commands.min.md
├── packs/
│   └── python/         # Python language pack
│       ├── indexer.py
│       ├── deps.py
│       ├── gate_pyright.py
│       ├── summarizer.py
│       ├── precommit.py
│       └── doctor.py
└── cli/
    └── vibe.py         # Unified CLI
```

## Usage

```bash
# Check setup
python vibe-kit/cli/vibe.py status

# Pre-commit (staged files only, fast)
python vibe-kit/cli/vibe.py precommit

# Full scan + context
python vibe-kit/cli/vibe.py doctor --context

# Initialize baseline
python vibe-kit/cli/vibe.py baseline --init
```

## Integration with ENSEMBLE

When `ensemble start` is executed:
- **GCC mode**: vibe-kit is enabled by default
- **Other modes**: Use `--with-vibe` to enable

```bash
ensemble start              # GCC mode → VIBE: ON
ensemble start --no-vibe    # Force disable
ensemble start --with-vibe  # Force enable for non-GCC
```

## Philosophy

1. **Don't fix all errors — just don't add more** (Baseline gate)
2. **Fast feedback loop** (Staged-only pre-commit)
3. **Full scan on demand** (Doctor for comprehensive analysis)
4. **Single source of truth** (LATEST_CONTEXT.md)

## Min Spec

See `core/spec/` for language-agnostic specifications that all packs must follow.

---

*vibe-kit v1.0.0 — Part of Antigravity Agent Architecture*
