# GitHub Repository Management Guide

이 문서는 Conitens 프로젝트의 GitHub 저장소 관리 방법을 설명합니다.

## Table of Contents

- [Repository Structure](#repository-structure)
- [Branch Strategy](#branch-strategy)
- [Issue Management](#issue-management)
- [Pull Request Workflow](#pull-request-workflow)
- [Release Process](#release-process)
- [Automation](#automation)

---

## Repository Structure

```
ensemble/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── upgrade_suggestion.md
│   ├── workflows/
│   │   └── ci.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── FUNDING.yml (optional)
├── docs/
│   ├── GITHUB_MANAGEMENT.md (this file)
│   └── UPGRADE_PROCESS.md
├── bin/
├── scripts/
├── .agent/
├── .notes/
├── .vibe/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── CHANGELOG.md
└── package.json
```

---

## Branch Strategy

### Main Branches

| Branch | Purpose | Protection |
|--------|---------|------------|
| `main` | Production-ready code | ✅ Protected |
| `develop` | Integration branch | Optional |

### Feature Branches

```bash
# Naming convention
feature/add-docker-support
fix/lock-timeout
docs/improve-readme
refactor/simplify-parser
```

### Protection Rules (main)

- Require pull request reviews (1+)
- Require status checks to pass
- Require linear history
- Include administrators

---

## Issue Management

### Labels

#### Type Labels

| Label | Color | Description |
|-------|-------|-------------|
| `bug` | #d73a4a | Something isn't working |
| `enhancement` | #a2eeef | New feature or request |
| `documentation` | #0075ca | Documentation changes |
| `upgrade-candidate` | #5319e7 | Proposed for next version |

#### Status Labels

| Label | Color | Description |
|-------|-------|-------------|
| `triage` | #fbca04 | Needs initial review |
| `confirmed` | #0e8a16 | Issue confirmed |
| `in-progress` | #1d76db | Being worked on |
| `blocked` | #b60205 | Blocked by dependency |

#### Priority Labels

| Label | Color | Description |
|-------|-------|-------------|
| `priority:critical` | #b60205 | Must fix immediately |
| `priority:high` | #d93f0b | Important, fix soon |
| `priority:medium` | #fbca04 | Normal priority |
| `priority:low` | #0e8a16 | Nice to have |

### Issue Workflow

```
New Issue
    │
    ▼
[triage] ──── Invalid? ──── Close with comment
    │
    ▼
[confirmed] ── Assign label + milestone
    │
    ▼
[in-progress] ── PR linked
    │
    ▼
Closed (by PR merge)
```

### Milestones

Create milestones for planned releases:

- `v4.3.0` — Next minor release
- `v5.0.0` — Next major release
- `backlog` — Future consideration

---

## Pull Request Workflow

### Creating a PR

1. Fork the repository
2. Create feature branch
3. Make changes
4. Run tests locally
5. Create PR using template

### Review Process

1. **Automated Checks**
   - CI passes (lint, test, version check)
   - No conflicts

2. **Code Review**
   - At least 1 approval required
   - Address all comments

3. **Merge**
   - Squash and merge preferred
   - Delete branch after merge

### PR Labels

| Label | Meaning |
|-------|---------|
| `ready-for-review` | Ready for maintainer review |
| `changes-requested` | Needs updates |
| `approved` | Approved, ready to merge |
| `do-not-merge` | Hold for some reason |

---

## Release Process

### Version Numbers

Follow Semantic Versioning (SemVer):

```
MAJOR.MINOR.PATCH

4.2.1
│ │ └── Patch: Bug fixes
│ └──── Minor: New features (backward compatible)
└────── Major: Breaking changes
```

### Release Checklist

#### 1. Prepare Release

```bash
# Update version
ensemble upgrade-setup --version X.Y.Z

# Review changes
git diff

# Update CHANGELOG.md
# Add release notes section
```

#### 2. Create Release

```bash
# Commit version bump
git add -A
git commit -m "chore: bump version to X.Y.Z"

# Create tag
git tag -a vX.Y.Z -m "Release vX.Y.Z"

# Push
git push origin main --tags
```

#### 3. GitHub Release

1. Go to Releases → Draft new release
2. Choose tag: `vX.Y.Z`
3. Title: `vX.Y.Z — Feature Name`
4. Generate release notes
5. Add highlights and breaking changes
6. Publish release

#### 4. npm Publish

```bash
# Login to npm (first time)
npm login

# Publish
npm publish

# Verify
npm info ensemble
```

### Release Notes Template

```markdown
## vX.Y.Z — Release Title

### 🎉 Highlights

- Feature 1
- Feature 2

### 🐛 Bug Fixes

- Fix 1 (#123)
- Fix 2 (#124)

### 💥 Breaking Changes

- Change 1 (migration guide below)

### 📖 Migration Guide

If upgrading from vX.Y.Z:
1. Step 1
2. Step 2

### 📊 Stats

- X commits
- Y contributors
- Z issues closed
```

---

## Automation

### GitHub Actions

#### CI Workflow (`ci.yml`)

Runs on:
- Push to `main`, `develop`
- Pull requests to `main`

Jobs:
- Test on multiple OS/Node/Python combinations
- Lint Python code
- Check version consistency
- Dry-run npm publish

#### Future Automation Ideas

- Auto-label PRs based on files changed
- Auto-assign reviewers
- Auto-merge dependabot PRs
- Release automation

### Dependabot (optional)

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

## Owner Responsibilities

Only the project owner can:

1. ✅ Merge to `main`
2. ✅ Create releases
3. ✅ Publish to npm
4. ✅ Manage repository settings
5. ✅ Handle security issues

Contributors can:

1. ✅ Open issues
2. ✅ Submit PRs
3. ✅ Review code
4. ✅ Participate in discussions

---

## Quick Reference

### Common Commands

```bash
# Clone
git clone https://github.com/seunghwan/conitens.git

# Create feature branch
git checkout -b feature/my-feature

# Push changes
git push origin feature/my-feature

# Create tag
git tag -a v4.2.1 -m "Release v4.2.1"

# Delete local branch
git branch -d feature/my-feature

# Delete remote branch
git push origin --delete feature/my-feature
```

### Useful Links

- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Keep a Changelog](https://keepachangelog.com/)
