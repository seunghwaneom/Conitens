# CLAUDE.md — Conitens v2 (Ensemble v4.2)

> Project context auto-loaded by Claude Code. All files MUST be created within `{workspace}/`.

---

## ⚙️ Mechanical Overrides

> Mandatory rules for production-grade output under constrained context.

| # | Rule | Detail |
|---|------|--------|
| 1 | **Step 0: clean before refactor** | Files >300 LOC: remove dead props/exports/imports/debug logs in a separate commit before structural work. |
| 2 | **Phased execution** | Multi-file refactors split into phases (max 5 files each). Complete → verify → user approval → next phase. |
| 3 | **Senior-dev bar** | Fix architecture flaws, duplicated state, inconsistent patterns. "What would a perfectionist reject in review?" Fix all of it. |
| 4 | **Forced verification** | Before claiming done: run `tsc --noEmit` + `eslint --quiet` (if configured), fix all errors. No type-checker = state that explicitly. |
| 5 | **Sub-agent swarming** | >5 independent files → parallel sub-agents (5-8 files each). Sequential = context decay. |
| 6 | **Context decay** | After 10+ messages, re-read files before editing. Auto-compaction may have destroyed context silently. |
| 7 | **Read budget** | Cap 2,000 lines/read. Files >500 LOC: use offset+limit chunks. Never assume full file from single read. |
| 8 | **Truncation awareness** | Tool results >50K chars truncated to 2KB preview. Suspiciously few results → re-run narrower. State when truncation suspected. |
| 9 | **Edit integrity** | Re-read before every edit, re-read after to confirm. Max 3 consecutive edits to same file without verification read. |
| 10 | **Rename = multi-grep** | No AST — grep separately for: direct calls, type refs, string literals, dynamic imports, re-exports/barrels, tests/mocks. |

---

## Ensemble — Task Lifecycle Protocol

> All work runs through `ensemble` commands. task.md = single source of truth.

### Auto-Triggers (MANDATORY)

Claude MUST detect and execute these automatically — no explicit invocation needed.

**Task creation** — any work request (KO: ~해줘/만들어줘/고쳐줘, EN: create/build/fix/implement):
```bash
ensemble new --case {NEW_BUILD|MODIFY|DEBUG|OTHER} --mode SOLO --agent CLAUDE --title "{summary}"
ensemble start --agent CLAUDE
```

**Logging** — immediately after every code write/modify, phase transition, or user feedback:
```bash
ensemble log --done "..." --change "..." --next "..."
```

**Verification** — after `.py`/`.js`/`.ts` file changes, mandatory before close:
```bash
ensemble verify --files {files}
```

### Forbidden Actions

| Action | Response |
|--------|----------|
| Code write without log | Block — log first |
| Close without verify PASS | Block — verify first |
| Phase transition without step log | Block — log first |

### Protocol Rules

| Rule | Detail |
|------|--------|
| STEP LOG MANDATORY | `ensemble log` on every phase transition |
| VERIFY BEFORE CLOSE | `ensemble verify` required (L1/L2 PASS) |
| JOURNAL ON DONE | Auto-generate journal on complete/halt/dump |
| FEEDBACK LOGGING | Always log user error reports and change requests |
| HASH AUDIT TRAIL | SHA-256 change tracking |

---

## Execution Modes

**SOLO** (default): Claude handles all phases — analyze → implement → self-review → close.
```
Phase 0: ensemble new + analyze → log
Phase 1: implement + test → log
Phase 2: self-review (security, error handling) → log
Phase 3: hash + journal → ensemble close
```

**GCC** (team): Gemini→Claude→Codex collaboration. Only work when `next_expected: CLAUDE`.

| Condition | Mode |
|-----------|------|
| Quick fix, simple feature | SOLO |
| Complex feature, security review needed | GCC |

---

## Feedback Handling

| Type | Trigger | Action |
|------|---------|--------|
| Error report | "error", "bug", "broken" | `ensemble error register` → fix → verify |
| Additional request | "also", "add", "more" | Extend active task OR `ensemble new --related {TASK_ID}` |
| Change request | "change", "modify" | `ensemble log --feedback` → implement |

---

## CLI Quick Reference

```bash
# Lifecycle
ensemble new --case {case} --mode SOLO --agent CLAUDE --title "{title}"
ensemble start --agent CLAUDE
ensemble log --done "..." --change "..." --next "..."
ensemble verify --files {files}
ensemble close --summary "..."

# Halt / Dump
ensemble halt --reason BLOCKER --desc "..." --resume "..."
ensemble dump --reason FAILURE --desc "..." --lesson "..."

# Error management
ensemble error register --type "..." --message "..." --file "..." --line N
ensemble error resolve --id ERR-001 --resolution "..."

# PAR mode (team)
ensemble lock acquire --file {file} --agent CLAUDE
ensemble lock release --file {file}
ensemble sync --agent CLAUDE

# Analysis
ensemble impact --files {file}
ensemble triage --run-id {RUN_ID}
ensemble preflight --task {TASK_ID}
```

### Self-Review Checklist (SOLO)

- [ ] Requirements met
- [ ] No obvious bugs
- [ ] Error handling adequate
- [ ] No hardcoded secrets
- [ ] Input validation implemented
- [ ] Tests exist and pass

### Tools

| Tool | Command |
|------|---------|
| Preflight | `python scripts/ensemble_preflight.py check --task TASK-ID` |
| Impact | `python scripts/ensemble_impact.py analyze --file {file}` |
| Context | `python scripts/ensemble_context.py generate` |
| Triage | `python scripts/ensemble_triage.py analyze --task TASK-ID` |

---

*Ensemble v4.2 — Conitens Task Lifecycle*
