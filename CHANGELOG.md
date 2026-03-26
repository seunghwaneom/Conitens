# Ensemble Changelog

## v4.2.0 (2026-02-01) — Quality Gates & User Communication

### 🚀 GitHub Release Ready

**프로젝트를 GitHub에 공개할 준비가 완료되었습니다!**

- `.github/` 템플릿 추가 (Issue, PR, CI workflow)
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` 추가
- `docs/GITHUB_MANAGEMENT.md` — 저장소 관리 가이드
- `docs/UPGRADE_PROCESS.md` — 업그레이드 프로세스 가이드

### 🔄 Self-Upgrade System (v4.2)

**Journal/Error에서 업그레이드 후보를 자동 추출하고, Owner만 버전 업그레이드 가능!**

```bash
# 1. 업그레이드 후보 스캔
ensemble upgrade-scan --since 2026-01-01

# 2. 버전 준비 (owner only)
ensemble upgrade-setup --version 4.3.0

# 3. 업그레이드 실행 (owner only)
ensemble upgrade --push
```

| Command | Purpose | Access |
|---------|---------|--------|
| `upgrade-scan` | Journal/Error에서 TODO/FIXME/버그 패턴 추출 | All |
| `upgrade-setup` | VERSION/package.json/CHANGELOG 업데이트 | Owner |
| `upgrade` | git commit + tag + push | Owner |
| `report` | GitHub Issue용 구조화된 보고서 생성 | All |

### 📝 User Report System

**Agent가 사용자의 보고서 작성을 도와줍니다:**

```bash
ensemble report --type bug        # 버그 리포트
ensemble report --type suggestion # 업그레이드 건의
ensemble report --type feedback   # 일반 피드백
```

생성된 `.notes/REPORTS/REPORT-*.md` 파일을 GitHub Issue에 복사하여 사용.

### 🔴 CRITICAL: `/ensemble-verify` — Mandatory Code Verification

**Close without VERIFY PASS is now BLOCKED!**

```bash
ensemble verify --files src/main.py,src/utils.py
```

| Level | Check | On Fail |
|-------|-------|---------|
| L1 | Syntax (py_compile, node --check) | 🔴 BLOCK |
| L2 | Import/Require resolution | 🔴 BLOCK |
| L3 | Smoke test (optional) | 🟡 WARN |

- `cmd_close` now checks `verify_status` in task.md header
- Use `--skip-verify` to bypass (not recommended)

### 🐛 Bug Fixes

**1. slugify 한글 지원**
- 기존: 한글이 모두 제거됨 → 빈 slug
- 수정: 한글 문자 유지, 특수문자만 제거
- 예시: "로그인 기능 구현" → "로그인-기능-구현"

**2. Journal 매칭 로직 개선**
- 기존: 오늘 날짜로만 Journal 검색 → Task 생성일과 불일치 시 실패
- 수정: Task ID에서 날짜/번호 추출하여 정확한 Journal 매칭
- Fallback: slug 매칭 → 오늘 날짜 매칭

### 🤖 AUTO-TRIGGER RULES (Agent별 자동 실행 규칙)

**모든 Agent 설정 파일에 명확한 IF-THEN 규칙 추가:**

| Agent | 파일 | 자동 트리거 |
|-------|------|------------|
| Gemini | `ensemble-protocol.md` | Task 생성, Logging, Verify, Workflow 선택 |
| Claude | `CLAUDE.md` | Task 생성, Logging, Verify, Workflow 선택 |
| Codex | `AGENTS.md` | Task 생성, Logging, Verify, Workflow 선택 |

**트리거 카테고리:**
- 🎯 Task Creation Triggers — "~해줘" → `ensemble new`
- 📝 Logging Triggers — 작업 완료 시 → `ensemble log`
- ✅ Verification Triggers — 코드 수정 시 → `ensemble verify`
- 🔄 Workflow Auto-Selection — 상황별 자동 workflow 선택
- ❌ Forbidden — 자동 감지 후 거부

**핵심 변화:**
- Agent가 workflow를 명시적으로 호출받지 않아도 자동 실행
- 사용자가 "로그인 기능 만들어줘"라고 하면 자동으로 Task 생성
- 코드 작성 후 자동으로 로깅
- close 전 자동으로 verify

### 🆕 New Workflows (6개 추가)

| Command | Purpose | Category |
|---------|---------|----------|
| `/ensemble-verify` | Code verification (syntax, import) | 🔴 Quality Gate |
| `/ensemble-reopen` | Reactivate COMPLETED task | Lifecycle |
| `/ensemble-review` | Request user review | Communication |
| `/ensemble-checkpoint` | Create rollback point | Safety |
| `/ensemble-pivot` | Change task direction | Flexibility |
| `/ensemble-handback` | Explicit user handoff | Communication |

### 📊 State Machine Update

```
INBOX → ACTIVE → (verify) → COMPLETED
              ↑                │
              │    reopen      │
              └────────────────┘
```

### 🛡️ Protocol Update

New mandatory rule:
```
| VERIFY BEFORE CLOSE | 코드 변경 시 `ensemble verify` 필수 (L1/L2 PASS) |
```

### 📋 CLI Updates

```bash
# New commands
ensemble verify --files "..." [--skip-smoke]
ensemble reopen --task "..." --reason "..."

# Updated commands
ensemble close [--skip-verify]  # Requires VERIFY PASS by default
```

### 🔄 Upgrade from v4.1.1

1. **Breaking**: `ensemble close` now requires `verify` to pass
2. New workflow files auto-recognized by IDE
3. All v4.1.1 functionality preserved

---

## v4.1.1 (2026-02-01) — Extended Workflow Commands

### 🆕 New Workflows (10개 추가)

Gemini 기여로 추가된 새로운 slash commands:

| Command | Purpose | Script |
|---------|---------|--------|
| `/ensemble-context` | LATEST_CONTEXT.md 생성/업데이트 | `ensemble_context.py` |
| `/ensemble-error` | 에러 레지스트리 관리 | `ensemble.py error` |
| `/ensemble-impact` | 변경 영향도 분석 | `ensemble_impact.py` |
| `/ensemble-lock` | 파일 락 관리 (PAR 모드) | `ensemble.py lock` |
| `/ensemble-manifest` | 재현성 매니페스트 생성 | `ensemble_manifest.py` |
| `/ensemble-metrics` | 메트릭 대시보드 | `ensemble.py metrics` |
| `/ensemble-preflight` | 실행 전 검증 | `ensemble_preflight.py` |
| `/ensemble-questions` | 질문 큐 관리 | `ensemble.py questions` |
| `/ensemble-triage` | 실패 원인 분석 | `ensemble_triage.py` |
| `/ensemble-weekly` | 주간 리포트 생성 | `ensemble_weekly.py` |

### 📝 Workflow YAML Frontmatter

모든 workflow 파일에 표준 frontmatter 추가:

```yaml
---
name: "Ensemble Context"
description: "Generate or update LATEST_CONTEXT.md"
slug: ensemble-context
---
```

### 🛠️ Skills 업데이트

`ensemble-toolkit/SKILL.md`에 18개 slash command 목록 추가:

| 카테고리 | Commands |
|---------|----------|
| **Core** | new, start, log, close, status |
| **Approval** | approve, questions |
| **Lifecycle** | halt, dump |
| **Analysis** | context, impact, triage, preflight |
| **Tracking** | error, manifest, metrics, weekly |
| **Concurrency** | lock |

### 🔄 Upgrade from v4.1.0

1. **새 workflows 자동 인식**: IDE 재시작 또는 Hard Reload
2. **기존 기능 유지**: 모든 v4.1.0 기능 호환

---

## v4.1.0 (2026-02-01) — Agent-Specific Configuration Guide

### 🆕 New Features

#### Agent별 폴더 구조 비호환성 문서화

각 AI Agent 도구가 서로 다른 설정 폴더를 사용한다는 것을 명시:

| Agent | 설정 폴더 | 메모리 파일 | Skills 자동 로드 |
|-------|----------|------------|----------------|
| **Antigravity (Gemini)** | `.agent/` | `.agent/rules/*.md` | ✅ `.agent/skills/` |
| **Claude Code** | `.claude/` | `CLAUDE.md` | ✅ `.claude/skills/` |
| **Codex** | `.codex/` | `AGENTS.md` | ✅ `~/.codex/skills/` |

**현재 Ensemble 구조**:
- `.agent/` = Antigravity 전용 (workflows, rules, skills 완전 지원)
- `CLAUDE.md` = Claude Code용 (인라인 + `@import` 구문 지원)
- `AGENTS.md` = Codex용 (인라인 + 체인)

#### Antigravity 자동인식 규칙 문서화

YAML Frontmatter 필수 필드 규칙 추가:

| 파일 유형 | 위치 | 필수 필드 | 예시 |
|----------|------|----------|------|
| **Workflows** | `.agent/workflows/*.md` | `slug` | `slug: ensemble-new` → `/ensemble-new` |
| **Skills** | `.agent/skills/my-skill/SKILL.md` | `name`, `description` | 폴더 기반 구조 필수 |
| **Rules** | `.agent/rules/*.md` | `trigger` | `trigger: always_on` |

**문제 해결 가이드**:
- `/` 명령어 안 보임 → `slug` 필드 추가
- Skill 활성화 안 됨 → 폴더 구조로 변경 (`skills/my-skill/SKILL.md`)
- Hard Reload: `Developer: Reload Window`

#### Skills 폴더 구조 변경

**Before** (v4.0):
```
.agent/skills/
└── SKILLS.md           # 파일 단독
```

**After** (v4.1):
```
.agent/skills/
└── ensemble-toolkit/   # 폴더 기반
    └── SKILL.md
```

### 📝 Documentation Updates

#### USAGE_GUIDE.md
- 섹션 2.1 "Antigravity 자동인식 규칙" 추가
- YAML Frontmatter 필수 필드 설명
- 문제 해결 가이드 (Hard Reload 등)

#### CLAUDE.md / AGENTS.md
- Skills 참조 경로 업데이트: `@.agent/skills/ensemble-toolkit/SKILL.md`

### 🔄 Upgrade from v4.0.0

1. **Skills 폴더 구조 변경**: `SKILLS.md` → `ensemble-toolkit/SKILL.md`
2. **Workflows 확인**: 모든 workflow에 `slug` 필드 추가됨
3. **Rules 확인**: `trigger: always_on` 필드 추가됨
4. **Hard Reload 권장**: IDE 재시작 또는 `Developer: Reload Window`

---

## v4.0.0 (2026-02-01) — Human-Agent Collaboration Major Update

### 🔑 New Philosophy

**v4.0 핵심 원칙**:

| 원칙 | 설명 |
|------|------|
| 1. Task 아이디어는 사람이 입력 | 사람이 자연어로 요청 → Agent가 Task 생성 |
| 2. 승인은 Agent 요청 시 수락 | Agent가 물어보면 사람이 accept/reject |
| 3. 모든 실행은 Agent가 수행 | ensemble 명령어는 Agent가 자동 실행 |
| 4. task.md가 유일한 진실 | 모든 Agent는 task.md를 SSOT로 참조 |

### 🆕 Major Features

#### 1. Agent Task Creation

**모든 Agent가 `ensemble new` 실행 가능**:

```bash
# Agent가 사용자 요청 감지 후 자동 실행
ensemble new --case DEBUG --mode SOLO --agent CLAUDE --title "버그 수정"
ensemble start --agent CLAUDE
```

**트리거 감지 패턴**:
| 한국어 | 영어 | Case |
|--------|------|------|
| "~해줘", "만들어줘" | "create", "build" | NEW_BUILD |
| "수정해줘", "개선" | "modify", "improve" | MODIFY |
| "버그", "에러" | "bug", "error" | DEBUG |
| "문서", "분석" | "docs", "analyze" | OTHER |

#### 2. Feedback Logging

**Phase 완료 후 사용자 피드백 자동 로깅**:

```bash
# 에러 보고 시
ensemble error register --type "TypeError" --message "..." --file "..." --line 42
ensemble log --feedback "사용자 에러 보고: ..." --done "수신"

# 추가 요청 시
ensemble log --feedback "추가 요청: ..." --done "수신" --next "구현"

# 관련 Task 연결
ensemble new --case MODIFY --title "피드백: ..." --related TASK-20260201-001
```

#### 3. Full SOLO Mode for All Agents

**모든 Agent가 단독으로 전체 워크플로우 수행 가능**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  SOLO Mode: 단일 Agent 전체 워크플로우                               │
├─────────────────────────────────────────────────────────────────────┤
│  Phase 0: Task 생성 + 분석                                          │
│  Phase 1: 구현 (또는 설계/검토)                                      │
│  Phase 2: 자가 검증                                                 │
│  Phase 3: 완료 (Journal + close)                                    │
└─────────────────────────────────────────────────────────────────────┘
```

| Agent | 단독 수행 가능 |
|-------|---------------|
| Gemini | ✅ 기획→문서→검증→완료 |
| Claude | ✅ 분석→구현→검증→완료 |
| Codex | ✅ 분석→점검→수정→완료 |

#### 4. Reduced Human Loading

**명령어 분류 재편**:

| 분류 | 명령어 |
|------|--------|
| 🧑 사람만 (드묾) | `init-owner`, `metrics` |
| 🤖 Agent 주도 (사람도 가능) | `new`, `start`, `status`, `approve`, `halt`, `dump`, `close`, `questions` |
| 🤖 Agent 전용 | `log`, `lock`, `sync`, `error`, `triage`, `manifest`, `preflight`, `impact`, `context`, `weekly` |

### 📝 Documentation Updates

#### USAGE_GUIDE.md

- 핵심 원칙 4조 명시
- "Agent에게 지시하기" 중심으로 재작성
- 피드백 루프 섹션 추가
- 명령어 분류표 업데이트

#### CLAUDE.md / AGENTS.md / ensemble-protocol.md

- Task Creation 섹션 추가
- Feedback Logging 섹션 추가
- SOLO Mode 전체 워크플로우 명시
- Mode 선택 기준표 추가

### ⚠️ Breaking Changes

1. **`ensemble new`**: Agent가 자동 실행 (사람 수동 실행도 가능)
2. **`--feedback` 옵션**: `ensemble log` 명령에 추가
3. **`--related` 옵션**: `ensemble new` 명령에 추가
4. **Protocol Rules**: FEEDBACK LOGGING 필수화

### 🔄 Upgrade from v3.9.x

1. **문서 업데이트**: CLAUDE.md, AGENTS.md, ensemble-protocol.md 교체
2. **Agent 학습**: 새로운 Task Creation 패턴 인식
3. **피드백 처리**: Phase 완료 후 피드백 로깅 확인

---

## v3.9.0 (2026-02-01) — vibe-kit Inspired Self-Improvement Edition

### 🆕 Major Features

#### 1. Triage System (자동 실패 분석)

`ensemble triage --run <run-id>` — 실패 원인 자동 분류 및 권장 조치 제안

**지원 패턴 10종**:
| ID | 패턴 | 원인 |
|----|------|------|
| T001 | Out of Memory | 메모리 부족 |
| T002 | Undefined function | 함수/모듈 없음 |
| T003 | File not found | 파일 경로 오류 |
| T004 | Permission denied | 권한 없음 |
| T005 | Toolbox required | 툴박스 미설치 |
| T006 | parpool error | 병렬 처리 오류 |
| T007 | Index exceeds | 배열 범위 초과 |
| T008 | NaN detected | 수치 오류 |
| T009 | Time limit exceeded | 시간 초과 |
| T010 | Module load failed | HPC 모듈 오류 |

#### 2. Manifest System (재현성 강화)

`ensemble manifest create/show/diff` — 실행 재현을 위한 완전한 매니페스트 기록

**기록 항목**:
- 실행 커맨드, 인자, 작업 디렉토리
- Git 커밋, 브랜치, dirty 상태
- 입력 파일 해시 (SHA-256)
- 출력 파일 해시
- 실행 시간, 메모리, 종료 코드

#### 3. Preflight System (데이터 계약 검사)

`ensemble preflight --task <task-id>` — 실행 전 데이터 유효성 검사

**검사 항목**:
- 파일/변수 존재 여부
- 배열 shape 검증
- 값 범위 (min/max)
- NaN/Inf 비율 임계값

#### 4. Impact Analysis (영향도 분석)

`ensemble impact --file <file>` — 파일 수정 시 영향 범위 분석

**제공 정보**:
- 의존성 그래프 (dependents)
- 위험도 점수 (low/medium/high/critical)
- workspace 작업 권장 여부
- 핫스팟 (변경 빈도 상위 파일)

#### 5. Weekly Self-Improvement (주간 자가개선)

`ensemble weekly` — 상태 폴더 기반 자동 개선 제안

**상태별 가중치**:
| 상태 | 가중치 | 용도 |
|------|--------|------|
| ERRORS | 5 | 재발 방지 |
| ACTIVE | 3 | 효율화 |
| HALTED | 2-3 | 기술적 문제 해결 |
| COMPLETED | 1 | 템플릿화 |
| DUMPED | 0 | 제외 |

#### 6. Context Management (LATEST_CONTEXT)

`ensemble context update/show` — 2-레일 포맷의 컨텍스트 자동 생성

**2-레일 구조**:
1. **Human Skim**: 30초 읽기용 요약
2. **Agent Inject**: 프롬프트 주입용 XML

### 📁 새 파일 구조

```
.notes/
├── WEEKLY/                    # NEW
│   └── WEEK-2026-05.md
├── LATEST_CONTEXT.md          # NEW
└── ACTIVE/TASK-*/runs/run-*/
    ├── run.manifest.json      # NEW
    ├── triage.json           # NEW
    └── preflight.json        # NEW (template)
```

### 📦 새 모듈

| 모듈 | 설명 |
|------|------|
| `ensemble_triage.py` | 실패 분석 엔진 |
| `ensemble_manifest.py` | 재현성 추적 |
| `ensemble_preflight.py` | 데이터 계약 검증 |
| `ensemble_impact.py` | 영향도 분석 |
| `ensemble_weekly.py` | 주간 리포트 생성 |
| `ensemble_context.py` | 컨텍스트 관리 |

### 🔧 개선사항

- 버전 3.9.0으로 업그레이드
- 모듈화된 아키텍처로 확장성 향상
- CLI 도움말에 v3.9 명령어 설명 추가

---

## v3.8.0 (2026-02-01) — Research Lab + General Purpose Edition

### 🆕 Major Features

#### 1. Conditional Auto-Approval System (3-Tier)

연구실 코드 개발과 일상 범용 사용을 위한 3단계 자동승인 시스템

**3-Tier 분류**:
| 단계 | 대상 | 동작 |
|------|------|------|
| AUTO-APPROVE | `.notes/**` 쓰기, `git status/diff/log`, `python -c` | 자동 승인 |
| GUARD | `workspace/TASK-*/**` 새 파일 생성 (크기/확장자 제한) | 조건부 자동 |
| ASK | 기존 파일 수정, repo 밖 쓰기, 위험 명령 | 질문 필수 |

#### 2. Question Queue Management

**TTL 및 Stale 처리**:
- 기본 TTL: 24시간
- 24시간 경과 시 자동 stale 표시
- stale 질문은 기본 승인 거부 (`--force` 필요)

**Snapshot Mismatch 탐지**:
- 질문 생성 시 스냅샷 저장: `git_head`, `policy_hash`, `target_paths`

**새 CLI 명령**:
```bash
ensemble questions list
ensemble questions prune --stale-hours 24 --force
ensemble questions snapshot
```

#### 3. Research Lab Features (MATLAB/Colab)

**MATLAB 실행 표준**:
- 진입점: `run_modified_file(modified_file)` 함수형
- `modified_file`은 이름만 (확장자 없이, 예: `foo`)
- 실행 전 `cd(matlab_folder)` 고정
- path_summary 상위 10개 로깅

#### 4. Metrics Collection

**1주/5 TASK 데이터 수집** 후 승인 캐시 도입 여부 결정
- 수집 항목: `ask_count`, `auto_count`, `stale_count`, `matlab_runs`, `matlab_errors`

```bash
ensemble metrics show
ensemble metrics reset
ensemble metrics export
```

#### 5. .gitignore Template

민감 정보 보호를 위한 기본 템플릿 제공

---

### 🔧 New CLI Commands

| 커맨드 | 설명 |
|--------|------|
| `ensemble questions list` | 질문 큐 목록 |
| `ensemble questions prune` | stale 질문 정리 |
| `ensemble metrics show` | 메트릭 표시 |
| `ensemble approve --kind <KIND>` | 특정 종류 질문만 승인 |

---

### 🔧 New Question Kinds

| Kind | 설명 |
|------|------|
| `MATLAB_RUN_CONFIRM` | MATLAB 실행 확인 |
| `COLAB_MODIFY_CONFIRM` | Colab 노트북 수정 확인 |
| `FIGURE_SAVE_CONFIRM` | 플롯/그림 저장 확인 |

---

### 📋 WORKSPACE_POLICY.json v2 스키마

policy_version 2로 업그레이드됨

---

## v3.7.0 (2026-02-01) — Question Gate & Approval System

### 🆕 Major Features

#### 1. Question Gate System

애매한 상황에서 "자동 진행" 대신 "질문 → 선택 → 승인" 흐름으로 안전성 확보

**핵심 개념**:
- 질문(Question): 정책에서 결정이 필요한 상황 (DATA_ROOT_CONFIRM, EXTERNAL_EXEC_CONFIRM, WRITE_DETECTED_CONFIRM)
- 선택지: 추천 1개 + 대안 2~3개
- 상태: `pending` → `auto_selected_waiting_confirm` → `executed`

**질문 생성 예시**:
```python
create_question(
    kind="DATA_ROOT_CONFIRM",
    prompt="데이터 루트 경로를 확인해주세요: /data/research",
    choices=[
        {"title": "확인하고 읽기 전용으로 등록", "action": "register_readonly", "risk": "low"},
        {"title": "이번 실행만 허용", "action": "allow_once", "risk": "medium"},
        {"title": "거부", "action": "deny", "risk": "none"},
    ],
    default_choice=1,
)
```

#### 2. AUTO_DEFAULT Mode

`ENSEMBLE_AUTO_DEFAULT=1` 설정 시 추천 선택지를 자동 선택하되, **실행은 승인까지 대기**

```bash
export ENSEMBLE_AUTO_DEFAULT=1
python ensemble.py start --task TASK-XXX

# 질문 발생 시:
# ⚠️ AUTO_SELECTED: choice=1 (confirm_readonly)
# ⏳ 실행 대기: ensemble approve --question Q-20260201-001
```

**핵심 철학**: "결정 자동화 O, 실행 자동화 X" → 속도와 안전 동시 확보

#### 3. Approval System (Owner-Only)

**승인 커맨드**:
```bash
# 특정 질문 승인
ensemble approve --question Q-20260201-001

# 최우선순위 질문 승인
ensemble approve --latest

# 검증만 (실행 없음)
ensemble approve --latest --dry-run
```

**소유자 인증** (`.notes/OWNER.json`):
- UID, username, hostname, git email 기반 매칭
- 소유자 아니면 승인 거부 + `APPROVE_DENIED` 이벤트 로깅

**kind 우선순위** (고정):
1. `WRITE_DETECTED_CONFIRM` (최우선)
2. `EXTERNAL_EXEC_CONFIRM`
3. `DATA_ROOT_CONFIRM`

#### 4. Project Owner Management

```bash
# 최초 설정
ensemble init-owner

# 출력:
# ┌─────────────────────────────────────────────────────────────────────┐
# │  👤 PROJECT OWNER INITIALIZED                                       │
# │  Username: seunghwan                                                │
# │  Hostname: workstation                                              │
# │  Git Email: seunghwan@example.com                                   │
# │  UID: 1000                                                          │
# │  ✅ Only this user can run `ensemble approve` in this project.     │
# └─────────────────────────────────────────────────────────────────────┘
```

#### 5. Tag Schema v1 (Fixed Tags)

표준화된 고정 태그로 Codex 파싱 및 분석 지원:

| 태그 | 값 |
|------|------|
| `domain` | research, code, ops, writing |
| `task_type` | bug_fix, new_feature, refactor, docs, infra |
| `risk` | low, medium, high |
| `status` | open, resolved, deferred |
| `component` | errors, sync, workspace, journaling, cli |
| `cause` | dependency, path, concurrency, parsing, logic, env |
| `resolution_type` | config, code_change, doc, retry, workaround |
| `lesson_type` | pitfall, pattern, heuristic, checklist |

#### 6. Workspace Policy (v3.7 Foundation)

`WORKSPACE_POLICY.json` 기본 구조:
```json
{
  "max_files": 1000,
  "max_total_bytes": 104857600,
  "allowed_extensions": [".py", ".js", ".ts", ".md", ".toml", ".yaml", ".yml", ".json", ".sh"],
  "write_roots": [".notes/", "output/"],
  "data_roots_mode": "infer_then_ask",
  "data_roots_max": 10,
  "external_exec_mode": "ask_on_ambiguity",
  "reject_roots": ["/", "/home", "/Users", "C:\\", "D:\\"]
}
```

---

### 🔧 New CLI Commands

| 커맨드 | 설명 |
|--------|------|
| `ensemble approve --question <id>` | 특정 질문 승인 |
| `ensemble approve --latest` | 최우선순위 질문 승인 |
| `ensemble init-owner` | 프로젝트 소유자 초기화 |
| `ensemble status --questions` | 대기 중 질문 표시 |

---

### 🔧 New Events

| 이벤트 | 설명 |
|--------|------|
| `QUESTION_CREATED` | 질문 생성됨 |
| `AUTO_SELECTED` | AUTO_DEFAULT로 자동 선택됨 |
| `QUESTION_ANSWERED` | 사용자가 질문에 응답함 |
| `APPROVAL_REQUESTED` | 승인 요청됨 |
| `APPROVED` | 승인 완료 |
| `APPROVE_DENIED` | 승인 거부 (소유자 아님) |
| `EXECUTED` | 승인 후 실행 완료 |
| `OWNER_INITIALIZED` | 소유자 초기화됨 |

---

### 🔧 New Environment Variables

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ENSEMBLE_AUTO_DEFAULT` | (off) | 1=추천 선택지 자동 선택 (실행은 승인 대기) |

---

### 📁 New Files

| 파일 | 목적 |
|------|------|
| `.notes/OWNER.json` | 프로젝트 소유자 정보 |
| `.notes/WORKSPACE_POLICY.json` | Workspace 정책 설정 |
| `.notes/ACTIVE/_pending_questions.json` | 대기 중 질문 목록 |
| `.notes/ACTIVE/_question_events.log` | 질문 관련 이벤트 로그 |

---

### 🔄 Upgrade from v3.6.x

1. **기존 프로젝트 호환**: v3.6.x 프로젝트에서 바로 사용 가능
2. **소유자 초기화 필요**: `ensemble init-owner` 실행
3. **AUTO_DEFAULT는 기본 off**: 명시적으로 켜야 작동

---

## v3.6.4 (2026-02-01) — Observability & Schema Stability

### 🔧 Observability Improvements

#### 1. Log Schema v1 (Codex-Friendly)

**문제**: 로그 필드가 향후 확장 시 호환성 보장 없음, epoch만으로는 사람이 읽기 불편

**해결**: 확장된 로그 스키마 + 버전 태그
```json
{
  "log_v": 1,
  "event": "STALE_LOCK_QUARANTINED",
  "timestamp_utc": 1738310400.0,
  "timestamp_utc_iso": "2026-02-01T08:00:00Z",
  "timestamp_kst": "2026-02-01T17:00:00+09:00",
  "hostname": "workstation",
  "pid": 12345,
  "details": { ... }
}
```

| 필드 | 목적 |
|------|------|
| `log_v` | 스키마 버전 (향후 호환성) |
| `timestamp_utc_iso` | ISO8601 형식 (grep/사람 친화적) |
| `hostname` | 멀티호스트 상관분석용 |

#### 2. Stale Threshold Default: 60s → 120s

**문제**: 60초는 I/O 지연 시 정상 락도 stale로 오판할 수 있음

**해결**: 기본값을 120초로 상향
```bash
# 기본값 (v3.6.4)
# ENSEMBLE_STALE_THRESHOLD=120

# 빠른 환경에서 공격적 설정
export ENSEMBLE_STALE_THRESHOLD=60
```

#### 3. Stale WARN at Exit

**문제**: stale 격리가 "조용히" 발생하여 사용자가 인지 못함

**해결**: 커맨드 종료 시 stale 발생 횟수 경고
```
⚠️  WARN: 2 stale lock(s) were quarantined. Check _lock_events.log for details.
```

#### 4. Debug Mode (ENSEMBLE_DEBUG=1)

**문제**: 로깅/롤링/청소 실패가 "조용히 무시"되어 진단 어려움

**해결**: 디버그 모드에서 내부 작업을 stderr로 출력
```bash
export ENSEMBLE_DEBUG=1
python ensemble.py error register ...

# Output:
[ENSEMBLE/LOG] Logged STALE_LOCK_QUARANTINED to ~/_lock_events.log
[ENSEMBLE/LOCK] Quarantined stale lock: ~/.notes/ACTIVE/test.json.lock
```

---

### 🆕 New Features

#### get_utc_iso()

ISO8601 형식의 UTC 타임스탬프 반환:
```python
>>> get_utc_iso()
'2026-02-01T08:00:00Z'
```

#### debug_print()

디버그 모드에서만 stderr 출력:
```python
debug_print("Lock acquired", category='LOCK')
# ENSEMBLE_DEBUG=1 일 때만: [ENSEMBLE/LOCK] Lock acquired
```

#### Stale Event Counter

프로세스 내 stale 이벤트 카운트:
```python
increment_stale_count()
get_stale_count()  # Returns int
print_stale_warning_if_any()  # Prints WARN if count > 0
```

---

### 🔧 Technical Changes

| Function/Variable | Change |
|-------------------|--------|
| `LOG_SCHEMA_VERSION` | 🆕 로그 스키마 버전 (1) |
| `DEBUG_MODE` | 🆕 환경변수 기반 디버그 모드 |
| `_stale_event_count` | 🆕 프로세스 내 stale 카운터 |
| `debug_print()` | 🆕 디버그 출력 |
| `get_utc_iso()` | 🆕 ISO8601 UTC 타임스탬프 |
| `increment_stale_count()` | 🆕 stale 카운터 증가 |
| `get_stale_count()` | 🆕 stale 카운터 조회 |
| `print_stale_warning_if_any()` | 🆕 종료 시 WARN 출력 |
| `log_event()` | 🔄 스키마 v1 적용 |
| `get_stale_threshold()` | 🔄 기본값 60→120 |
| `_quarantine_stale_lock()` | 🔄 stale 카운터 연동 |
| `main()` | 🔄 종료 시 WARN 호출 |

---

### 📋 Environment Variables (Updated)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ENSEMBLE_STALE_THRESHOLD` | **120** | stale 판단 기준 (초) |
| `ENSEMBLE_STALE_CLEANUP_DAYS` | 7 | stale 파일 보관 일수 |
| `ENSEMBLE_DEBUG` | (off) | 1=디버그 모드 활성화 |

---

## v3.6.3 (2026-02-01) — Operations Polish

### 🔧 Operations Improvements

#### 1. Log Rolling

**문제**: 이벤트 로그가 무한 증가하여 디스크 점유 + 민감 정보 누적

**해결**:
- 5MB 초과 시 자동 로테이션 (`.1`, `.2`, `.3`)
- 최대 3개 백업 유지 (총 ~20MB)
- 가장 오래된 파일은 자동 삭제

```python
LOG_MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
LOG_MAX_ROTATIONS = 3
```

#### 2. Path Masking

**문제**: 로그에 전체 경로가 남아 홈 디렉토리 등 민감 정보 노출

**해결**: 홈 디렉토리를 `~`로 치환
```python
# Before: /home/username/projects/secret-client/src/api.py
# After:  ~/projects/secret-client/src/api.py
```

#### 3. Stale File Auto-Cleanup

**문제**: `*.lock.stale.*` 파일이 무한 누적

**해결**:
- 7일 이상 된 stale 파일 자동 삭제
- lock acquire 시 트리거
- 삭제 이벤트 로깅

```bash
# 환경변수로 조정 가능
export ENSEMBLE_STALE_CLEANUP_DAYS=14  # 14일 보관
export ENSEMBLE_STALE_CLEANUP_DAYS=0   # 자동 삭제 비활성화
```

#### 4. Temp File Auto-Cleanup

**문제**: 중단된 작업으로 `ensemble_*.tmp` 파일 잔류

**해결**: 24시간 이상 된 temp 파일 자동 삭제

#### 5. Environment Variable Config

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ENSEMBLE_STALE_THRESHOLD` | 60 | stale 판단 기준 (초) |
| `ENSEMBLE_STALE_CLEANUP_DAYS` | 7 | stale 파일 보관 일수 (0=비활성화) |

#### 6. WSL2/Windows 드라이브 경고 문서화

ENSEMBLE.md에 지원 환경 표 추가:
- `/mnt/c`, `/mnt/d` 등 Windows 드라이브 사용 비권장
- Linux 파일시스템 (`~/projects/...`) 사용 권장
- 증상 및 해결책 안내

---

### 🆕 New Features

#### Unified log_event Function

모든 이벤트 로깅을 단일 함수로 통합:
```python
log_event(log_file, 'EVENT_TYPE', {'key': 'value'}, mask_paths=True)
```

#### Cleanup Functions

```python
# 수동 청소 가능
cleanup_old_stale_files(directory, days=7)
cleanup_old_temp_files(directory, hours=24)
```

---

### 🔧 Technical Changes

| Function | Change |
|----------|--------|
| `mask_sensitive_path()` | 🆕 홈 디렉토리 마스킹 |
| `rotate_log_if_needed()` | 🆕 로그 롤링 |
| `log_event()` | 🆕 통합 이벤트 로깅 |
| `cleanup_old_stale_files()` | 🆕 stale 파일 청소 |
| `cleanup_old_temp_files()` | 🆕 temp 파일 청소 |
| `get_stale_threshold()` | 🆕 환경변수 읽기 |
| `get_stale_cleanup_days()` | 🆕 환경변수 읽기 |
| `FileLock.acquire()` | 🔄 청소 트리거 추가 |
| `log_storage_event()` | 🔄 log_event 사용 |
| `FileLock._log_stale_event()` | 🔄 log_event 사용 |

---

### 📋 Recommended .gitignore Update

```gitignore
# Ensemble runtime files (v3.6.3)
.notes/ACTIVE/_locks.json
.notes/ACTIVE/_locks.json.bak
.notes/ACTIVE/*.lock
.notes/ACTIVE/*.lock.stale.*
.notes/ACTIVE/_lock_events.log
.notes/ACTIVE/_lock_events.log.*
.notes/ERRORS/_registry.json
.notes/ERRORS/_registry.json.bak
.notes/ERRORS/*.lock
.notes/ERRORS/_storage_events.log
.notes/ERRORS/_storage_events.log.*
ensemble_*.tmp
```

---

## v3.6.2 (2026-02-01) — Stale Lock Safety & Event Logging

### 🔧 Critical Improvements

#### 1. [CRITICAL] Stale Lock Safety

**문제**: Stale lock 자동 삭제 시 오판으로 정상 락이 제거될 위험

**해결**:
- 삭제 대신 `*.lock.stale.<utc_timestamp>`로 rename (격리/감사 가능)
- 동일 호스트면 `is_process_alive(pid)` 확인 후 제거 결정
- `_lock_events.log`에 모든 stale lock 처리 기록

```python
# Stale lock은 삭제 대신 격리
os.rename(lockfile, f"{lockfile}.stale.{int(time.time())}")

# 같은 호스트에서 프로세스가 살아있으면 stale 아님
if metadata.get('hostname') == self.hostname:
    if is_process_alive(metadata.get('pid')):
        return False  # Not stale
```

#### 2. [CRITICAL] Rich Lock Metadata

**문제**: 락 파일에 PID만 저장되어 디버깅 어려움

**해결**: 락 파일에 풍부한 메타데이터 저장
```json
{
  "pid": 12345,
  "hostname": "workstation",
  "acquired_at_utc": 1738310400.0,
  "ttl_seconds": 60
}
```

#### 3. Storage Event Logging

**문제**: JSON 손상/복구 시 추적 불가

**해결**: `_storage_events.log`에 모든 스토리지 이벤트 기록
- `JSON_CORRUPTION_DETECTED`
- `JSON_RECOVERED_FROM_BACKUP`
- `BACKUP_RECOVERY_FAILED`
- `JSON_RESET_TO_DEFAULT`

#### 4. Improved Temp File Naming

**문제**: `*.tmp` 전체 무시는 다른 도구의 임시파일도 숨김

**해결**: `ensemble_{filename}_*.tmp` 패턴 사용
```python
tempfile.mkstemp(prefix=f'ensemble_{basename}_', suffix='.tmp', dir=dir_path)
```

---

### 🆕 New Features

#### Lock Holder Info in Timeout Messages

락 획득 실패 시 현재 보유자 정보 표시:
```
TimeoutError: Could not acquire lock on _registry.json (held by: pid=12345, host=workstation, age=45s)
```

---

### 🔧 Technical Changes

| Function/Class | Change |
|----------------|--------|
| `FileLock._write_lock_metadata()` | 🆕 풍부한 메타데이터 저장 |
| `FileLock._read_lock_metadata()` | 🆕 메타데이터 읽기 (v3.6.1 하위호환) |
| `FileLock._is_lock_stale()` | 🆕 age + process alive 이중 검사 |
| `FileLock._quarantine_stale_lock()` | 🆕 삭제 대신 rename |
| `FileLock._log_stale_event()` | 🆕 stale lock 이벤트 로깅 |
| `FileLock.get_holder_info()` | 🆕 락 보유자 정보 반환 |
| `is_process_alive()` | 🆕 PID로 프로세스 생존 확인 |
| `log_storage_event()` | 🆕 스토리지 이벤트 로깅 |
| `atomic_write_json()` | 🔄 명확한 temp 파일명 |
| `read_json_safe()` | 🔄 복구 이벤트 로깅 추가 |

#### New Log Files

| File | Purpose |
|------|---------|
| `_lock_events.log` | FileLock stale 처리 기록 |
| `_storage_events.log` | JSON 손상/복구 이벤트 |

---

### 📋 Recommended .gitignore Update

```gitignore
# Ensemble runtime files (v3.6.2)
.notes/ACTIVE/_locks.json
.notes/ACTIVE/_locks.json.bak
.notes/ACTIVE/*.lock
.notes/ACTIVE/*.lock.stale.*
.notes/ACTIVE/_lock_events.log
.notes/ERRORS/_registry.json
.notes/ERRORS/_registry.json.bak
.notes/ERRORS/*.lock
.notes/ERRORS/_storage_events.log
ensemble_*.tmp
```

---

## v3.6.1 (2026-02-01) — Stability Hotfix

### 🔧 Critical Bug Fixes

#### 1. [CRITICAL] Timezone Bug in Lock Expiration

**문제**: `is_lock_expired()`가 KST/UTC 혼용으로 VPS(UTC)에서 락이 즉시 만료되거나 영원히 유지됨

**해결**: UTC 기반 비교로 통일
```python
# Before: datetime.now() (naive) vs KST string
# After: UTC timestamp 비교
acquired_utc = parse_timestamp_to_utc(lock_info['acquired_at'])
now_utc = get_utc_timestamp()
diff_minutes = (now_utc - acquired_utc) / 60
```

#### 2. [CRITICAL] Atomic Writes for JSON Files

**문제**: `_registry.json`/`_locks.json`이 동시 쓰기나 중간 종료 시 손상될 수 있음

**해결**: 
- Temp file + `os.replace()` 패턴 적용
- `.bak` 백업 파일 자동 생성
- JSON 파싱 실패 시 백업에서 복구 시도

```python
def atomic_write_json(filepath: str, data: dict):
    fd, temp_path = tempfile.mkstemp(suffix='.tmp', dir=dir_path)
    # ... write to temp ...
    os.replace(temp_path, filepath)  # Atomic on POSIX
```

#### 3. [CRITICAL] File-Based Locking for Concurrent Access

**문제**: 동시 실행 시 Error ID 충돌, 레지스트리 경쟁 조건

**해결**: `FileLock` 클래스 도입
- `*.lock` 파일 기반 프로세스 간 락
- 60초 이상 stale lock 자동 해제
- 5초 타임아웃 + 재시도 로직

#### 4. Error Signature Normalization Improvement

**문제**: 파일 경로 정규화 부족으로 같은 에러가 분리되거나, 과도한 숫자 치환으로 다른 에러가 병합됨

**해결**:
```python
# 파일 경로 정규화
def normalize_file_path(file_path: str) -> str:
    normalized = file_path.replace('\\', '/')
    if normalized.startswith('./'):
        normalized = normalized[2:]
    return normalized.lower()

# 선택적 숫자 치환 (라인번호, 메모리주소, 타임스탬프만)
normalized_msg = re.sub(r'line \d+', 'line N', msg)
normalized_msg = re.sub(r':\d+:', ':N:', msg)
normalized_msg = re.sub(r'0x[0-9a-fA-F]+', 'ADDR', msg)
```

#### 5. Error MD Frontmatter Sync on Resolve

**문제**: `resolve_error()`가 레지스트리만 업데이트하고 개별 에러 md의 frontmatter는 `status: OPEN` 유지

**해결**: frontmatter 동기화 추가
```yaml
# Before resolve:
status: OPEN

# After resolve:
status: RESOLVED
resolved_at: 2026-02-01T15:00:00+09:00
resolved_by: CLAUDE
```

#### 6. findings.md Manual Notes Preservation

**문제**: 자동 생성 시 사용자 메모(재현 커맨드, 링크 등)가 덮어쓰기로 손실

**해결**: `<!-- MANUAL NOTES -->` 마커 기반 보존
```markdown
## 📊 Error Hotspots (by file)
...

---

<!-- MANUAL NOTES - DO NOT DELETE THIS MARKER -->

## 📝 Manual Notes

> 이 섹션 아래의 내용은 자동 갱신 시에도 보존됩니다.
```

---

### 🆕 New Features

#### Signature Versioning

레지스트리에 `sig_version` 필드 추가 (향후 알고리즘 변경 시 마이그레이션 지원):
```json
{
  "errors": [...],
  "last_updated": "...",
  "sig_version": 1
}
```

---

### 🔧 Technical Changes

| Function | Change |
|----------|--------|
| `get_utc_timestamp()` | 🆕 UTC 타임스탬프 반환 |
| `parse_timestamp_to_utc()` | 🆕 ISO8601 → UTC 변환 |
| `normalize_file_path()` | 🆕 파일 경로 정규화 |
| `atomic_write_json()` | 🆕 원자적 JSON 쓰기 |
| `read_json_safe()` | 🆕 백업 복구 지원 JSON 읽기 |
| `FileLock` | 🆕 프로세스 간 파일 락 클래스 |
| `is_lock_expired()` | 🔄 UTC 기반 비교로 수정 |
| `error_signature()` | 🔄 정규화 알고리즘 개선 |
| `resolve_error()` | 🔄 frontmatter 동기화 추가 |
| `generate_findings()` | 🔄 MANUAL NOTES 보존 |
| `write_locks()` | 🔄 원자적 쓰기 적용 |
| `write_errors_registry()` | 🔄 원자적 쓰기 + 파일 락 적용 |

---

### 📋 Validation Checklist

- [ ] 터미널 2개에서 `error register` 연타 → ID 충돌/JSON 손상 0건
- [ ] VPS(UTC)에서 락 획득 후 31분 뒤 만료 정상 동작
- [ ] resolve 후 md frontmatter와 registry status 일치
- [ ] findings.md 재생성 시 MANUAL NOTES 보존

---

## v3.6 (2026-02-01) — Error Registry & PAR Sync Point

### 🚀 Major Changes

#### 1. Error Registry System (ERRORS/ + _registry.json)

**새 디렉토리 구조**:
```
.notes/
├── ERRORS/                    ← 🆕 에러 추적
│   ├── _registry.json         ← 에러 인덱스
│   ├── ERR-20260201-001.md    ← 개별 에러 파일
│   └── ERR-20260201-002.md
├── findings.md                ← 🆕 자동 생성 요약
├── ACTIVE/
├── COMPLETED/
└── ...
```

**Error Types**:
| Type | Description |
|------|-------------|
| `SYNTAX` | 구문 오류 |
| `IMPORT` | 모듈 임포트 오류 |
| `RUNTIME` | 런타임 오류 |
| `TYPE` | 타입 오류 |
| `LOGIC` | 로직 오류 |
| `CONFIG` | 설정 오류 |
| `BUILD` | 빌드 오류 |
| `TEST` | 테스트 실패 |
| `OTHER` | 기타 |

#### 2. Error CLI Commands

```bash
# 에러 등록
ensemble error register --type IMPORT --file src/api/auth.py --msg "No module named xyz"

# 에러 검색
ensemble error search --file src/api/auth.py
ensemble error search --status OPEN
ensemble error search --type RUNTIME

# 에러 해결 기록
ensemble error resolve --id ERR-20260201-001 --resolution "Fixed by adding xyz to requirements.txt"

# 에러 목록
ensemble error list

# findings.md 수동 생성
ensemble error findings
```

#### 3. Signature-Based Duplicate Detection

**동일 에러 자동 병합**:
```
$ ensemble error register --type IMPORT --file src/api.py --msg "ModuleNotFoundError: xyz"

⚠️ 중복 에러 감지! 기존 에러와 병합됨:
   ID: ERR-20260201-001
   Related Tasks: [TASK-ACTIVE-20260130-003, TASK-COMPLETED-20260128-001]

💡 힌트: 이 에러는 이전에 다음 태스크에서 발생했습니다:
   - TASK-ACTIVE-20260130-003
```

**시그니처 정규화**:
- 숫자 → `N`
- 메모리 주소 → `ADDR`
- 문자열 → `X`
- 대소문자 무시

#### 4. Auto-Generated findings.md

**Close 시 자동 생성**:
```bash
ensemble close
```
```
✅ Task 완료!
...
🔓 Released 2 lock(s)
📊 Findings updated: findings.md
```

**findings.md 내용**:
```markdown
# Findings (자동 생성)

> **Total Errors**: 5 (Open: 2, Resolved: 3)

## 🔥 Active Issues (OPEN)
### ERR-20260201-001 - IMPORT
- **File**: `src/api/auth.py`
- **Occurrences**: 3

## ✅ Resolved Issues & Learnings
### ERR-20260130-002 - RUNTIME [RESOLVED]
- **Resolution**: Fixed by updating dependency version

## 📊 Error Hotspots (by file)
| File | Open | Resolved | Total |
|------|------|----------|-------|
| `src/api/auth.py` | 1 | 2 | 3 |
```

#### 5. PAR Mode Sync Point

**동기화 명령**:
```bash
ensemble sync
```

**Sync Point 동작**:
1. 만료 락 자동 정리
2. findings.md 갱신
3. 파티션 충돌 검사
4. 해결 필요 충돌 리포트

**충돌 유형**:
| Type | Description |
|------|-------------|
| `PARTITION_OVERLAP` | 두 에이전트의 파티션 겹침 |
| `PARTITION_NESTED` | 파티션이 다른 파티션을 포함 |
| `LOCK_IN_PARTITION` | 다른 에이전트의 락이 내 파티션 안에 있음 |

**출력 예시**:
```
┌─────────────────────────────────────────────────────────────────────┐
│  🔄 SYNC POINT EXECUTION                                            │
├─────────────────────────────────────────────────────────────────────┤
│  ⚠️ CONFLICTS DETECTED:
│     • Partition overlap: ['GEMINI', 'CLAUDE'] on {'src/shared/'}
│     • Lock conflict: src/api/auth.py locked by CODEX, in CLAUDE's partition
├─────────────────────────────────────────────────────────────────────┤
│  📋 ACTIONS TAKEN:
│     • Cleaned up 2 expired locks
│     • Updated .notes/findings.md
│     • Found 2 conflicts requiring attention
├─────────────────────────────────────────────────────────────────────┤
│  ⚠️ 충돌 해결 필요! 다음 에이전트들의 조율이 필요합니다:
│     → @GEMINI
│     → @CLAUDE
│     → @CODEX
│
│  권장 조치:
│     1. 각 에이전트 작업 일시 중지
│     2. 충돌 파티션 재협상
│     3. 락 정리: ensemble lock cleanup
│     4. 재시작: ensemble sync --force
└─────────────────────────────────────────────────────────────────────┘
```

---

### 📝 Minor Changes

#### Status Command Enhancement

```bash
ensemble status --errors    # 에러 요약 포함 표시
```

#### Close Command Enhancement

- Agent 락 자동 해제
- findings.md 자동 생성

---

### 🔧 Technical Changes

#### New Utility Functions

| Function | Purpose |
|----------|---------|
| `ensure_errors_dir()` | ERRORS 디렉토리 생성 |
| `read_errors_registry()` | _registry.json 읽기 |
| `write_errors_registry()` | _registry.json 쓰기 |
| `error_signature()` | 에러 시그니처 생성 (중복 감지용) |
| `register_error()` | 에러 등록 |
| `search_errors()` | 에러 검색 |
| `resolve_error()` | 에러 해결 |
| `generate_findings()` | findings.md 생성 |
| `check_sync_needed()` | Sync 필요 여부 검사 |
| `execute_sync_point()` | Sync 실행 |

#### New Files

| File | Purpose |
|------|---------|
| `.notes/ERRORS/` | 에러 추적 디렉토리 |
| `.notes/ERRORS/_registry.json` | 에러 레지스트리 |
| `.notes/findings.md` | 에러 요약 (자동 생성) |

#### _registry.json Schema

```json
{
  "errors": [
    {
      "id": "ERR-20260201-001",
      "type": "IMPORT",
      "file": "src/api/auth.py",
      "line": 42,
      "message": "No module named xyz",
      "signature": "abc123def456...",
      "related_tasks": ["TASK-ACTIVE-20260201-001"],
      "status": "OPEN",
      "first_seen": "2026-02-01T10:00:00+09:00",
      "last_seen": "2026-02-01T14:00:00+09:00",
      "occurrences": 3,
      "registered_by": "CLAUDE"
    }
  ],
  "last_updated": "2026-02-01T14:00:00+09:00"
}
```

---

### 🔄 Backward Compatibility

- 기존 v3.5 모든 기능 유지
- ERRORS 디렉토리는 첫 에러 등록 시 자동 생성
- findings.md는 close 시 자동 생성 (없어도 무방)

---

## v3.5 (2026-02-01) — Collision Prevention & Enhanced Case System

### 🚀 Major Changes

#### 1. Word-Based Case System

**Before (v3.4)**:
```yaml
case: 1   # 숫자만 - 의미 파악 어려움
```

**After (v3.5)**:
```yaml
case: NEW_BUILD
case_description: 새로운 기능/파일 생성
```

**Case Definitions**:
| Case | Legacy | Description | Triggers |
|------|--------|-------------|----------|
| `NEW_BUILD` | 1 | 새로운 기능/파일 생성 | 만들어줘, 생성, 새로 |
| `MODIFY` | 2 | 기존 코드 수정/개선 | 수정해줘, 변경, 개선 |
| `OTHER` | 3 | 문서/분석/리뷰 작업 | 문서, 분석, 리뷰 |
| `DEBUG` | 4 | 버그 수정/디버깅 | 에러, 버그, 디버그 |

> **하위 호환**: 기존 숫자 (1, 2, 3) 입력도 지원

#### 2. Multi-Focus Support (PAR Mode)

**_focus.md 확장**:
```yaml
---
current_task: TASK-ACTIVE-20260201-001-api
switched_at: 2026-02-01T14:30:00+09:00
switched_by: CLAUDE
mode: PAR
---

## Parallel Tasks
### GEMINI
- task_id: TASK-ACTIVE-20260201-002-docs
- partition: ["docs/", "README.md"]
- started_at: 2026-02-01T14:30:00+09:00

### CLAUDE
- task_id: TASK-ACTIVE-20260201-001-api
- partition: ["src/api/"]
- started_at: 2026-02-01T14:00:00+09:00
```

#### 3. File Lock System (_locks.json)

**충돌 방지를 위한 파일 단위 락**:
```json
{
  "locks": {
    "src/api/auth.py": {
      "agent": "CLAUDE",
      "task_id": "TASK-ACTIVE-20260201-001",
      "acquired_at": "2026-02-01T14:30:00+09:00",
      "ttl_minutes": 30
    }
  }
}
```

**CLI Commands**:
```bash
ensemble lock list                           # 현재 락 목록
ensemble lock acquire --file src/api.py     # 락 획득
ensemble lock release --file src/api.py     # 락 해제
ensemble lock cleanup                        # 만료 락 정리
ensemble lock release-all --agent CLAUDE     # 에이전트 락 전체 해제
```

#### 4. Duplicate Task Detection

**태스크 생성 시 유사도 검사**:
```
⚠️  유사한 태스크가 이미 존재합니다:
   - [INBOX] TASK-INBOX-20260201-001-api-auth.md (유사도: 67%)
   - [ACTIVE] TASK-ACTIVE-20260131-002-api-login.md (유사도: 50%)

계속 생성하시겠습니까? (y/N):
```

**Skip 옵션**: `--force` 또는 `-f`로 검사 건너뛰기

#### 5. Conflict Detection Command

**PAR 모드 충돌 검사**:
```bash
ensemble conflicts
```
```
┌─────────────────────────────────────────────────────────────────────┐
│  🔍 CONFLICT CHECK                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  📋 Active Parallel Tasks:
│    GEMINI: TASK-ACTIVE-20260201-002-docs
│      Partition: ["docs/", "README.md"]
│    CLAUDE: TASK-ACTIVE-20260201-001-api
│      Partition: ["src/api/"]
├─────────────────────────────────────────────────────────────────────┤
│  ✅ No partition conflicts detected
├─────────────────────────────────────────────────────────────────────┤
│  🔒 Active File Locks: 2
│    src/api/auth.py → CLAUDE
│    docs/API.md → GEMINI
└─────────────────────────────────────────────────────────────────────┘
```

---

### 📝 Minor Changes

#### Status Command Enhancement

```bash
ensemble status --locks    # 락 정보 포함 표시
```

- Parallel tasks 섹션 추가
- Case 이름 표시 (숫자 대신 단어)
- 활성 락 자동 표시

#### task.md Header Extension

```yaml
---
case: NEW_BUILD                     # 🆕 단어 기반
case_description: 새로운 기능/파일 생성  # 🆕 설명 추가
---
```

---

### 🔧 Technical Changes

#### New Utility Functions

| Function | Purpose |
|----------|---------|
| `normalize_case()` | 레거시 숫자 → 단어 변환 |
| `text_similarity()` | 텍스트 유사도 (Jaccard) |
| `check_duplicate_tasks()` | 중복 태스크 검색 |
| `get_full_focus()` | 전체 포커스 상태 (병렬 포함) |
| `acquire_lock()` | 파일 락 획득 |
| `release_lock()` | 파일 락 해제 |
| `check_partition_conflict()` | 파티션 충돌 검사 |

#### New Files

| File | Purpose |
|------|---------|
| `.notes/ACTIVE/_locks.json` | 파일 락 상태 |

---

### 🔄 Backward Compatibility

- `--case 1`, `--case 2`, `--case 3` 입력 지원 유지
- 기존 task.md의 `case: 1` 읽기 가능 (표시만 변환)
- 기존 _focus.md 형식과 호환

---

## v3.4 (2026-01-31) — Flexible Patterns & Standalone Support

### 🚀 Major Changes

#### 1. Execution Patterns (직렬/병렬/자유)

**Serial (SRL)** — 기존 방식 유지
```
G → C → C (순차, State Guard: STRICT)
```

**Parallel (PAR)** — 🆕 신규
```
G / C / X (독립 실행, State Guard: NONE)
- 각 에이전트가 담당 partition 내에서 작업
- Sync Point에서 병합
```

**Free (FRE)** — 🆕 신규
```
순서 무관 (State Guard: SOFT)
- 사용자가 에이전트 직접 지정
- next_expected: ANY 허용
```

#### 2. Standalone Agent Support (SOLO Mode)

- CLAUDE.md/AGENTS.md만으로 전체 워크플로우 수행 가능
- Solo/Team 모드 분리 문서화
- 자가 검증 체크리스트 추가

#### 3. New Status: HALTED / DUMPED

**.notes/ 디렉토리 확장**:
```
.notes/
├── INBOX/
├── ACTIVE/
├── COMPLETED/
├── HALTED/     ← 🆕 중단 (재개 가능)
├── DUMPED/     ← 🆕 폐기 (재개 불가)
└── JOURNAL/
```

**HALTED 사유**:
- `BLOCKER`: 외부 의존성 블로커
- `RESOURCE`: 리소스 부족
- `PRIORITY`: 우선순위 밀림

**DUMPED 사유**:
- `PIVOT`: 방향 전환
- `FAILURE`: 기술적 실패
- `CANCELLED`: 프로젝트 취소

#### 4. New Workflows

- `/ensemble-halt` — Task 중단
- `/ensemble-dump` — Task 폐기

---

### 📝 Minor Changes

#### 1. Task Naming Convention

**Before (v3.3)**:
```
TASK-20260131-1430.md
```

**After (v3.4)**:
```
TASK-(위치)-(날짜)-(번호)-(설명).md
TASK-ACTIVE-20260131-001-user-auth-api.md
```

- 위치 태그: INBOX, ACTIVE, COMPLETED, HALTED, DUMPED
- 일련번호: 일별 자동 증가 (001, 002, ...)
- 설명: kebab-case 영문

#### 2. Journal Naming Convention

**Before (v3.3)**:
```
2026-01-31_TASK-20260131-1430.md
```

**After (v3.4)**:
```
2026-01-31-001-user-auth-api.md
```

---

### 🔧 Technical Changes

#### task.md Header (v3.4)

```yaml
---
task_id: TASK-ACTIVE-20260131-001-user-auth-api
status: ACTIVE
pattern: SRL | PAR | FRE     # 🆕
mode: G | GCC | XXX | PAR | SOLO
agents: [GEMINI, CLAUDE, CODEX]  # 🆕
state_guard: STRICT | SOFT | NONE  # 🆕
partitions:                   # 🆕 PAR 모드용
  GEMINI: ["docs/"]
  CLAUDE: ["src/"]
owner: CLAUDE
next_expected: CODEX | ANY | NONE
created_at: 2026-01-31T14:30:00+09:00
updated_at: 2026-01-31T15:00:00+09:00
---
```

#### State Guard Modes

| Pattern | State Guard | Behavior |
|---------|-------------|----------|
| SRL | STRICT | next_expected 불일치 → HALT |
| PAR | NONE | 검사 안함 |
| FRE | SOFT | 불일치 → WARN + 진행 |
| SOLO | NONE | 검사 안함 |

#### CLI Commands

**신규 명령**:
```bash
ensemble halt --reason BLOCKER --desc "..." --resume "..."
ensemble dump --reason FAILURE --desc "..." --lesson "..."
ensemble status --halted --dumped
```

**확장된 옵션**:
```bash
ensemble new --mode SOLO --agent CLAUDE
ensemble new --pattern PAR
ensemble new --guard SOFT
```

---

### 📁 File Changes

| File | Change |
|------|--------|
| `ENSEMBLE.md` | Pattern/Mode 정의 확장, HALTED/DUMPED 추가 |
| `CLAUDE.md` | Solo/Team 모드 분리, 자가검증 체크리스트 |
| `AGENTS.md` | Solo/Team 모드 분리, 보안 체크리스트 |
| `ensemble-protocol.md` | 병렬/자유 패턴 규칙 |
| `ensemble.py` | 새 명령 (halt, dump), 명명 규칙 |
| `ensemble-halt.md` | 🆕 중단 워크플로우 |
| `ensemble-dump.md` | 🆕 폐기 워크플로우 |
| `USAGE_GUIDE.md` | 전면 업데이트 |

---

### ⚠️ Breaking Changes

1. **executor_chain → agents**: XXX 모드에서 배열 형태로 통일
2. **Journal 파일명**: 기존 파일은 수동 리네임 필요
3. **HALTED/DUMPED 폴더**: 수동 생성 필요 (`mkdir -p .notes/HALTED .notes/DUMPED`)

### 🔄 Backward Compatibility

- 기존 `TASK-YYYYMMDD-HHMM.md` 형식 인식 가능
- `mode: G/GCC/XXX`는 자동으로 `pattern: SRL` 매핑
- `next_expected` 필드는 SRL 모드에서만 STRICT 강제

---

## v3.3 (2026-01-30)

- Workflow commands 통합
- Focus pointer 메커니즘
- 2-level logging (STEP LOG + Journal)

## v3.2 (2026-01-29)

- Multi-tool orchestration
- Extension handoff protocol

## v3.1 (2026-01-28)

- Initial multi-agent architecture
- task.md as Single Source of Truth

---

*Ensemble Changelog — Last updated: 2026-01-31*
