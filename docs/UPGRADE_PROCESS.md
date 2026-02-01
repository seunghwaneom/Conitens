# Conitens Upgrade Process

이 문서는 Conitens의 자체 업그레이드 시스템 사용법을 설명합니다.

## Overview

Conitens v4.2+는 Self-Upgradable 시스템을 지원합니다:

```
┌─────────────────────────────────────────────────────────────────┐
│                    UPGRADE WORKFLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📊 Journal/Errors ──► upgrade-scan ──► UPGRADE_CANDIDATES.md   │
│                                                                  │
│  📝 GitHub Issues ──► (manual review) ──► Feature list          │
│                                                                  │
│  🔧 upgrade-setup ──► Version bump + CHANGELOG ──► git commit   │
│                                                                  │
│  🚀 upgrade --push ──► git tag ──► GitHub Release ──► npm       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Collecting Upgrade Candidates

### From Journals & Errors

```bash
# Scan journals for upgrade hints
ensemble upgrade-scan

# Scan from specific date
ensemble upgrade-scan --since 2026-01-15

# Output: .notes/UPGRADE_CANDIDATES.md
```

**Detected Patterns:**

| Pattern | Example | Category |
|---------|---------|----------|
| `TODO:` | `TODO: add retry logic` | Enhancement |
| `FIXME:` | `FIXME: race condition` | Bug |
| `개선 필요` | `이 부분 개선 필요함` | Enhancement |
| `버그:` | `버그: 타임아웃 발생` | Bug |
| `다음에 해야` | `다음에 해야 할 것: 캐싱` | Feature |

### From GitHub Issues

Issues labeled `upgrade-candidate` are manually reviewed.

### Sample UPGRADE_CANDIDATES.md

```markdown
# Upgrade Candidates

Generated: 2026-02-01T10:30:00+09:00
Scanned: 2026-01-01 ~ 2026-02-01

## 🐛 Bugs (3)

1. **Lock timeout on slow NFS** (JOURNAL-2026-01-15)
   - Context: PAR mode sync failed
   - Pattern: `FIXME: race condition`
   
2. **Korean slug empty** (ERR-20260120-001)
   - File: scripts/ensemble.py
   - Pattern: slugify removes all Korean

## ✨ Enhancements (2)

1. **Add Docker support** (JOURNAL-2026-01-22)
   - Pattern: `TODO: containerize`
   
2. **Improve error messages** (GitHub #45)
   - Source: upgrade-candidate label

## 📊 Summary

- Total candidates: 5
- Bugs: 3
- Enhancements: 2
- Breaking changes: 0
```

---

## 2. Preparing an Upgrade (Owner Only)

### upgrade-setup Command

```bash
# Prepare minor version upgrade
ensemble upgrade-setup --version 4.3.0

# With changelog message
ensemble upgrade-setup --version 4.3.0 --changelog "Add Docker support"

# Dry run (show what would change)
ensemble upgrade-setup --version 4.3.0 --dry-run
```

**What it does:**

1. ✅ Validates semantic version format
2. ✅ Updates `.vibe/VERSION`
3. ✅ Updates `package.json` version
4. ✅ Prepends entry to `CHANGELOG.md`
5. ✅ Stages files (does NOT commit)

### CHANGELOG Entry Format

```markdown
## v4.3.0 (2026-02-15) — Docker Support

### 🎉 New Features

- Docker containerization support
- `ensemble docker build` command

### 🐛 Bug Fixes

- Fixed Korean slug handling (#52)
- Fixed lock timeout on slow NFS (#48)

### 📖 Documentation

- Added Docker deployment guide

### 🔄 Upgrade from v4.2.x

No breaking changes. Direct upgrade supported.
```

---

## 3. Executing the Upgrade (Owner Only)

### upgrade Command

```bash
# Review staged changes first
git status
git diff --staged

# Execute upgrade
ensemble upgrade

# Or with push
ensemble upgrade --push
```

**What it does:**

1. ✅ Commits staged files
2. ✅ Creates git tag `vX.Y.Z`
3. ✅ (with --push) Pushes to origin

### After upgrade --push

Manual steps required:

1. **Create GitHub Release**
   ```
   GitHub → Releases → Draft new release
   → Select tag vX.Y.Z
   → Auto-generate release notes
   → Publish
   ```

2. **Publish to npm**
   ```bash
   npm publish
   ```

---

## 4. User Reports

### Agent-Assisted Report Creation

Users can create structured reports with agent help:

```bash
# Create bug report
ensemble report --type bug

# Create feature suggestion
ensemble report --type suggestion

# Create general feedback
ensemble report --type feedback
```

**Workflow:**

1. Agent asks clarifying questions
2. Agent generates `.notes/REPORTS/REPORT-YYYY-MM-DD-NNN.md`
3. User copies content to GitHub Issue

### Report Template

```markdown
---
type: bug
created: 2026-02-01T15:30:00+09:00
agent: Claude
---

# Bug Report: Lock timeout on PAR mode

## Environment
- Conitens: 4.2.0
- OS: Ubuntu 22.04
- Python: 3.10.12

## Description
Lock acquisition fails after 30 seconds in PAR mode...

## Steps to Reproduce
1. Start PAR mode task
2. Run `ensemble sync`
3. Wait for timeout

## Expected vs Actual
...

## Related
- Task: TASK-20260201-001
- Error: ERR-20260201-003
```

---

## 5. Version Numbering Guide

### When to Increment

| Change Type | Increment | Example |
|-------------|-----------|---------|
| Breaking API change | Major | 4.2.0 → 5.0.0 |
| New command | Minor | 4.2.0 → 4.3.0 |
| New optional flag | Minor | 4.2.0 → 4.3.0 |
| Bug fix | Patch | 4.2.0 → 4.2.1 |
| Documentation only | Patch | 4.2.0 → 4.2.1 |
| Performance improvement | Patch | 4.2.0 → 4.2.1 |

### Breaking Changes

Breaking changes require:
1. Major version bump
2. Migration guide in CHANGELOG
3. Deprecation warning in previous version (if possible)

---

## 6. Quick Reference

### Complete Upgrade Cycle

```bash
# 1. Scan for candidates
ensemble upgrade-scan --since $(date -d "1 month ago" +%Y-%m-%d)

# 2. Review candidates
cat .notes/UPGRADE_CANDIDATES.md

# 3. Prepare upgrade (owner only)
ensemble upgrade-setup --version 4.3.0

# 4. Review changes
git status
git diff --staged
cat CHANGELOG.md | head -50

# 5. Execute upgrade (owner only)
ensemble upgrade --push

# 6. Create GitHub Release (manual)
# 7. npm publish (manual)
npm publish
```

### Rollback

If something goes wrong:

```bash
# Delete local tag
git tag -d v4.3.0

# Delete remote tag (if pushed)
git push origin --delete v4.3.0

# Reset version files
git checkout HEAD~1 -- .vibe/VERSION package.json CHANGELOG.md

# Commit revert
git commit -m "revert: undo v4.3.0 release"
```

---

## 7. Automation Roadmap

Future improvements planned:

- [ ] Auto-generate release notes from commits
- [ ] GitHub Action for npm publish
- [ ] Automated changelog formatting
- [ ] Issue → upgrade-candidate auto-labeling
- [ ] Breaking change detection from AST diff
