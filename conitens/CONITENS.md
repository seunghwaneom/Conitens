# CONITENS v4.1.1 — Multi-Tool Orchestration

> **Core Architecture**: Antigravity + Claude Code Extension + Codex Extension
> 
> **v4.1.1 Features**: Agent별 설정 폴더 구조 문서화 + Skills 참조 방식 추가
>
> **v4.0 Features**: Agent 자율 실행 + 단일 Agent 전체 워크플로우 지원

---

## ⚠️ Supported Environments

| Environment | Support Status | Notes |
|-------------|----------------|-------|
| **Linux (EXT4, XFS)** | ✅ Fully supported | Recommended |
| **macOS (APFS)** | ✅ Fully supported | |
| **Windows (NTFS)** | ⚠️ Partial support | File lock behavior may differ |
| **WSL2 (Linux FS)** | ✅ Fully supported | Use `~/projects/...` |
| **WSL2 (/mnt/c, /mnt/d)** | ❌ Not recommended | See below |
| **NFS/Network drives** | ❌ Not supported | Lock/mtime unstable |

### WSL2 Windows Drive Warning

Using Windows drives (`/mnt/c`, `/mnt/d`) in WSL2 causes file lock and mtime behavior differences that may result in:

- Locks frequently quarantined as stale
- Repeated lock acquisition failures (timeout)
- Concurrency protection not working properly

**Solution**: Move project to Linux filesystem
```bash
# Not recommended
cd /mnt/c/Users/me/projects/myapp

# Recommended
cd ~/projects/myapp
```

---

## [WHY] Why Conitens?

### Problem
```
Limitations of single AI tools:
1. Context limit: Forgets initial instructions in long projects
2. Hallucination: Quality degrades when one model handles all roles (planning+implementation+verification)
3. Quota exhaustion: Work stops when limit reached on single tool
4. No verification: Structural problem of reviewing own code
5. Error repetition: Same errors repeat across tasks (solved in v3.6)
```

### Solution
```
Role separation + Independent verification + Flexible collaboration:
- Gemini: Planning specialist (2M+ context, Deep Think)
- Claude: Implementation specialist (terminal control, Tool Calling)
- Codex:  Verification specialist (security audit, code review)

→ Leverage each tool's strengths + Independent verification + Context-appropriate collaboration patterns
```

---

## [0] Quick Reference

```
┌─────────────────────────────────────────────────────────────────────┐
│  CONITENS v3.9 — FLEXIBLE MULTI-TOOL ORCHESTRATION                  │
├─────────────────────────────────────────────────────────────────────┤
│  📌 PATTERNS: SRL (Serial) / PAR (Parallel) / FRE (Free)           │
│  📌 MODES: G (Gemini) / GCC (G→C→C) / XXX (custom chain) / SOLO    │
├─────────────────────────────────────────────────────────────────────┤
│  🔧 TOOL ARCHITECTURE:                                              │
│     Antigravity Agent  → .agent/rules/, .agent/workflows/           │
│     Claude Code Ext    → CLAUDE.md (standalone capable)             │
│     Codex Extension    → AGENTS.md (standalone capable)             │
├─────────────────────────────────────────────────────────────────────┤
│  📁 SHARED STATE (all files created within {workspace}/ only):      │
│     .notes/INBOX/      → Waiting                                    │
│     .notes/ACTIVE/     → In progress                                │
│     .notes/COMPLETED/  → Completed                                  │
│     .notes/HALTED/     → 🆕 Halted (resumable)                      │
│     .notes/DUMPED/     → 🆕 Dumped (not resumable)                  │
│     .notes/JOURNAL/    → Session journals                           │
├─────────────────────────────────────────────────────────────────────┤
│  📝 NAMING CONVENTION (v3.9):                                       │
│     Task: TASK-(location)-(date)-(num)-(desc).md                    │
│     Journal: (date)-(num)-(desc).md                                 │
├─────────────────────────────────────────────────────────────────────┤
│  🔑 CORE PRINCIPLES (maintained in all modes):                      │
│     1. TASK AS SSOT — task.md is the single source of truth        │
│     2. STEP LOG MANDATORY — Record at every phase transition       │
│     3. JOURNAL ON DONE — Create journal on completion              │
│     4. HASH AUDIT TRAIL — SHA-256 change tracking                  │
│     5. STATUS DISCIPLINE — Follow state transition rules           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## [1] Execution Patterns (since v3.4, updated v3.9)

### 1.1 Pattern Overview

| Pattern | Code | Flow | State Guard | Use Case |
|---------|------|------|-------------|----------|
| **Serial** | `SRL` | G→C→C sequential | STRICT | Planning→Implementation→Verification cycle |
| **Parallel** | `PAR` | Independent | NONE | Role-based file separation |
| **Free** | `FRE` | Any order | SOFT | Flexible collaboration |

### 1.2 Serial Pattern (SRL) — Same as original GCC

```yaml
pattern: SRL
mode: GCC
agents: [GEMINI, CLAUDE, CODEX]
state_guard: STRICT
# Sequential handoff based on next_expected
```

```
GEMINI ─────────→ CLAUDE ─────────→ CODEX
  │    next:CLAUDE   │    next:CODEX   │
  │                  │                 │
  └──────────────────┴─────────────────┴──→ DONE
                     ↑ cycle if needed ↑
```

### 1.3 Parallel Pattern (PAR)

```yaml
pattern: PAR
mode: PAR
agents: [GEMINI, CLAUDE, CODEX]
state_guard: NONE
partitions:
  GEMINI: ["docs/", "config/"]
  CLAUDE: ["src/backend/"]
  CODEX: ["src/security/"]
```

```
GEMINI ──────────┐
                 │
CLAUDE ──────────┼──→ [Sync Point] ──→ DONE
                 │
CODEX  ──────────┘
    Independent work    Merge/Verify
```

**Key Rules**:
- Each agent works only within assigned `partition`
- CONFLICT warning when modifying other partitions
- Conflict resolution at Sync Point

### 1.4 Free Pattern (FRE)

```yaml
pattern: FRE
mode: FRE
agents: [GEMINI, CLAUDE]
state_guard: SOFT  # Only warn on conflict
```

```
GEMINI ←───→ CLAUDE
  ↑           ↑
  └────┬──────┘
       │
  Any order, user-specified
```

**Key Rules**:
- `next_expected: ANY` allowed
- User explicitly specifies agent
- Share work content via STEP LOG

---

## [2] Mode Definitions

### 2.1 Mode Overview

| Mode | Pattern | Agents | Description |
|------|---------|--------|-------------|
| **G** | SRL | Gemini only | Gemini standalone |
| **GCC** | SRL | G→C→C | Full cycle (original) |
| **XXX** | SRL/FRE | Custom chain | Custom combination |
| **PAR** | PAR | All parallel | Parallel work |
| **SOLO** | - | Any single | 🆕 Single agent |

### 2.2 SOLO Mode (NEW)

**Single agent executes full workflow**:

```yaml
mode: SOLO
agent: CLAUDE  # or GEMINI, CODEX
pattern: SOLO
state_guard: NONE
```

**SOLO Mode Workflow**:
```
[SOLO AGENT]
    ├─ Phase 0: Task creation/analysis
    ├─ Phase 1: Planning/design
    ├─ Phase 2: Implementation
    ├─ Phase 3: Self-review
    ├─ STEP LOG recording
    └─ DONE + Journal creation
```

> **Key**: Conitens Core Principles maintained even in SOLO mode
> (SSOT, STEP LOG, Journal, Hash)

### 2.3 Journal Rule (Common to All Modes)

```
⚠️ Key: The tool that sets status to DONE/HALTED/DUMPED creates the Journal.

🚨 MANDATORY JOURNALING:
- The tool handling status termination is responsible for the Journal regardless of mode
- Status termination without Journal is not allowed — this rule is absolute
- Location: {workspace}/.notes/JOURNAL/{YYYY-MM-DD}-{num}-{desc}.md
```

---

## [3] Status & State Flow (Extended)

### 3.1 Status Definition

```
┌─────────────────────────────────────────────────────────────────────┐
│  STATUS LIFECYCLE                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  INBOX ──→ ACTIVE ──→ DONE-AWAITING-USER ──→ DONE ──→ COMPLETED    │
│              │                                                      │
│              ├──(blocker)──→ HALTED ──(resume)──→ ACTIVE           │
│              │                    │                                 │
│              │                    └──(abandon)──→ DUMPED           │
│              │                                                      │
│              └──(direction change)───────────────→ DUMPED          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 New Status: HALTED

```yaml
status: HALTED
reason: BLOCKER | RESOURCE | PRIORITY
blocker_description: "Waiting for external API"
halted_at: {timestamp}
resume_condition: "After API release"
```

**HALTED Conditions**:
| Reason | Description | Example |
|--------|-------------|---------|
| `BLOCKER` | External dependency | API not available, library not supported |
| `RESOURCE` | Resource shortage | Quota exhausted, time constraint |
| `PRIORITY` | Priority shift | More urgent work emerged |

### 3.3 New Status: DUMPED

```yaml
status: DUMPED
reason: PIVOT | FAILURE | CANCELLED
dump_description: "Technical approach failed"
dumped_at: {timestamp}
lessons_learned: "Consider SSE instead of WebSocket"
```

**DUMPED Conditions**:
| Reason | Description | Example |
|--------|-------------|---------|
| `PIVOT` | Direction change | Requirements completely changed |
| `FAILURE` | Technical failure | Approach proved impossible |
| `CANCELLED` | Project cancelled | Business decision |

---

## [4] Naming Convention (v3.9)

### 4.1 Task Naming

**Format**: `TASK-(location)-(date)-(num)-(desc).md`

| Component | Format | Example |
|-----------|--------|---------|
| Location | INBOX/ACTIVE/COMPLETED/HALTED/DUMPED | ACTIVE |
| Date | YYYYMMDD | 20260131 |
| Number | NNN (daily serial number) | 001 |
| Description | kebab-case | user-auth-api |

**Examples**:
```
TASK-INBOX-20260131-001-user-auth-api.md
TASK-ACTIVE-20260131-001-user-auth-api.md
TASK-COMPLETED-20260131-001-user-auth-api.md
```

**Auto-rename on location move**:
```bash
# INBOX → ACTIVE
mv TASK-INBOX-*.md → TASK-ACTIVE-*.md (change location tag in filename)
```

### 4.2 Journal Naming

**Format**: `(date)-(num)-(desc).md`

**Example**:
```
2026-01-31-001-user-auth-api.md
```

> Maintains 1:1 mapping with Task file

---

## [5] Directory Structure

```
{workspace}/
├── .agent/                          # Antigravity Agent only
│   ├── rules/
│   │   └── ensemble-protocol.md
│   └── workflows/
│       ├── ensemble-new.md
│       ├── ensemble-start.md
│       ├── ensemble-log.md
│       ├── ensemble-close.md
│       ├── ensemble-status.md
│       ├── ensemble-halt.md         # 🆕 Halt workflow
│       └── ensemble-dump.md         # 🆕 Dump workflow
│
├── .notes/                          # ⭐ Shared state
│   ├── INBOX/
│   ├── ACTIVE/
│   │   └── _focus.md
│   ├── COMPLETED/
│   ├── HALTED/                      # 🆕
│   ├── DUMPED/                      # 🆕
│   └── JOURNAL/
│
├── CLAUDE.md                        # Claude (standalone capable)
├── AGENTS.md                        # Codex (standalone capable)
├── CONITENS.md                      # This file
└── scripts/
    └── ensemble.py
```

---

## [6] State Guard Configuration

### 6.1 State Guard Modes

| Guard Mode | Behavior | Pattern |
|------------|----------|---------|
| `STRICT` | next_expected mismatch → HALT | SRL |
| `SOFT` | Mismatch → WARN + allow proceed | FRE |
| `NONE` | No check | PAR, SOLO |

### 6.2 task.md Header (v3.9)

```yaml
---
task_id: TASK-ACTIVE-20260131-001-user-auth-api
status: ACTIVE
pattern: SRL | PAR | FRE
mode: G | GCC | XXX | PAR | SOLO
agents: [GEMINI, CLAUDE, CODEX]  # Participating agents
executor_chain: CLAUDE→CODEX    # For XXX mode (optional)
partitions:                      # For PAR mode (optional)
  GEMINI: ["docs/"]
  CLAUDE: ["src/"]
state_guard: STRICT | SOFT | NONE
owner: GEMINI | CLAUDE | CODEX
next_expected: GEMINI | CLAUDE | CODEX | ANY | NONE
created_at: 2026-01-31T14:30:00+09:00
updated_at: 2026-01-31T15:00:00+09:00
---
```

---

## [7] Handoff Protocol

### 7.1 Serial (SRL) Handoff — Same as original

```
1. Current tool: Write STEP LOG + Journal append
2. Current tool: Update next_expected
3. User: Switch to next tool sidebar
4. Next tool: Check State Guard then work
```

### 7.2 Parallel (PAR) Sync Point

```
1. All agents: Complete work within own partition
2. All agents: Write STEP LOG
3. Reach Sync Point:
   - Check for file conflicts
   - No conflicts → Proceed to DONE
   - Conflicts exist → User resolves or designated agent merges
```

### 7.3 Free (FRE) Handoff

```
1. User: Specify desired agent
2. Designated agent: Read task.md and check STEP LOG
3. Designated agent: Perform work + Add STEP LOG
4. Repeat (any order)
```

---

## [8] Agent-Specific Instructions

### 8.1 Gemini (Antigravity)
→ See `.agent/rules/ensemble-protocol.md`

### 8.2 Claude Code
→ See `CLAUDE.md` (standalone capable)

### 8.3 Codex
→ See `AGENTS.md` (standalone capable)

---

## [9] Security Configuration

```
# ~/.gemini/antigravity/terminalAllowlist.txt
git *
npm *
pip install *
python *
pytest *
node *

# ~/.gemini/antigravity/terminalDenylist.txt
rm -rf /
sudo rm *
curl | bash
```

---

## [10] Migration from v3.3

### 10.1 Automatic Mappings

| v3.3 | v3.4 |
|------|------|
| `mode: G` | `mode: G`, `pattern: SRL` |
| `mode: GCC` | `mode: GCC`, `pattern: SRL` |
| `mode: XXX` | `mode: XXX`, `pattern: SRL` (default) |
| `executor_chain` | `agents: [...]` |

### 10.2 New Fields

```yaml
# v3.4 new fields
pattern: SRL | PAR | FRE        # Execution pattern
agents: [GEMINI, CLAUDE, CODEX] # Participating agent list
state_guard: STRICT | SOFT | NONE
partitions: {}                  # For PAR mode
```

### 10.3 Breaking Changes

- Task filename convention changed (recommended, backward compatible)
- Journal filename convention changed
- `HALTED/`, `DUMPED/` folders need to be added

---

*Version: CONITENS v3.9.0 (2026-02-01) — Collision Prevention, Case System, Duplicate Detection*
