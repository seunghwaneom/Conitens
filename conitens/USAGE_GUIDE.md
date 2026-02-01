# Ensemble v4.1.1 사용 가이드

> **v4.1.1 핵심 변경**: Agent별 설정 폴더 구조 차이 문서화
> Agent가 대부분의 작업을 자율적으로 수행합니다.
> 사람은 **아이디어 입력**과 **승인**만 하면 됩니다.

---

## 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **1. 아이디어는 사람이 입력** | "로그인 기능 만들어줘"처럼 자연어로 지시 |
| **2. 승인은 Agent 요청 시 수락** | Agent가 물어보면 accept/reject |
| **3. 모든 실행은 Agent가 수행** | Task 생성부터 완료까지 Agent가 ensemble 실행 |
| **4. task.md가 유일한 진실** | 모든 Agent는 task.md를 참조하고 업데이트 |

---

## 1. 설치

### 방법 A: npm link (권장)

```bash
# Ensemble 폴더 압축 해제
unzip ENSEMBLE_v4.zip -d ~/tools/

# 글로벌 링크
cd ~/tools/ensemble_v4
npm link

# 확인
ensemble --version
```

### 방법 B: 프로젝트에 복사

```bash
cp -r ensemble_v4/* /your/project/
python scripts/ensemble.py --version
```

---

## 2. Antigravity IDE에서 .agent 등록

### .agent 폴더 구조

Antigravity IDE는 프로젝트 루트의 `.agent/` 폴더를 자동으로 인식합니다.

```
.agent/
├── rules/
│   └── ensemble-protocol.md    # 항상 활성화 (trigger: always_on)
├── skills/
│   └── ensemble-toolkit/       # 폴더 기반 skill
│       └── SKILL.md            # 도구 사용법 및 명령어
└── workflows/
    ├── ensemble-new.md         # /ensemble-new 명령
    ├── ensemble-start.md       # /ensemble-start 명령
    ├── ensemble-log.md         # /ensemble-log 명령
    ├── ensemble-close.md       # /ensemble-close 명령
    ├── ensemble-status.md      # /ensemble-status 명령
    ├── ensemble-approve.md     # /ensemble-approve 명령
    ├── ensemble-halt.md        # /ensemble-halt 명령
    ├── ensemble-dump.md        # /ensemble-dump 명령
    └── ensemble-init-owner.md  # /ensemble-init-owner 명령
```

### 등록 방법

**자동 등록 (권장)**

Ensemble 폴더를 프로젝트에 복사하면 `.agent/` 폴더가 자동으로 포함됩니다:

```bash
cp -r ~/tools/ENSEMBLE_v4/ENSEMBLE/.agent /your/project/
```

Antigravity IDE를 열면 자동으로 인식:
- `rules/` → 항상 활성화된 프로토콜
- `workflows/` → `/ensemble-*` 슬래시 명령 사용 가능
- `skills/` → 도구 참조 문서

**수동 등록**

Antigravity IDE 설정에서 직접 등록:

1. IDE 설정 열기 (⚙️)
2. `Agent Configuration` > `Custom Rules` 선택
3. `.agent/rules/ensemble-protocol.md` 경로 추가
4. 저장 후 재시작

### 확인 방법

```
/help
```

응답에서 ensemble 워크플로우가 보이면 등록 완료:
- `/ensemble-new`, `/ensemble-start`, `/ensemble-log`, ...

### ⚠️ Agent별 폴더 구조 차이

각 Agent는 서로 다른 설정 폴더를 사용합니다:

| Agent | 설정 폴더 | 메모리 파일 | Skills 자동 로드 |
|-------|----------|------------|----------------|
| **Antigravity (Gemini)** | `.agent/` | `.agent/rules/*.md` | ✅ `.agent/skills/` |
| **Claude Code** | `.claude/` | `CLAUDE.md` | ✅ `.claude/skills/` |
| **Codex** | `.codex/` | `AGENTS.md` | ✅ `~/.codex/skills/` |

**현재 Ensemble 구조:**
- `.agent/` = Antigravity 전용 (workflows, rules, skills)
- `CLAUDE.md` = Claude Code용 (인라인 + `@import` 지원)
- `AGENTS.md` = Codex용 (인라인 + 체인)

**Claude Code에서 Skills 참조:**
```markdown
# CLAUDE.md 내부에서
@.agent/skills/ensemble-toolkit/SKILL.md
```

**Codex에서 Skills 참조:**
AGENTS.md 내에 인라인으로 포함되어 있음 (🛠️ Skills & Tools Reference 섹션)

---

## 2.1. Antigravity 자동인식 규칙 (YAML Frontmatter)

> ⚠️ **중요**: 파일이 폴더에 존재하더라도 YAML Frontmatter가 올바르지 않으면 `/` 명령어로 호출할 수 없습니다.

### Workflows (슬래시 명령어)

**필수 필드**: `slug`

```yaml
---
name: "Task 이름"                    # (권장) UI에 표시될 이름
description: "상세 설명"              # (권장) Agent가 언제 사용할지 판단
slug: my-workflow                    # (필수) /my-workflow로 호출하기 위한 ID
---
```

**예시** (`.agent/workflows/ensemble-new.md`):
```yaml
---
name: "Ensemble New Task"
description: "Create a new Task with automatic case/mode detection"
slug: ensemble-new
---
```

→ 채팅창에서 `/ensemble-new` 입력 시 자동완성 및 실행 가능

### Skills (전문 지식)

**구조**: 폴더 기반 (파일 단독 X)

```
.agent/skills/
└── my-skill/              # 폴더명 = skill 식별자
    └── SKILL.md           # 필수 파일명
```

**SKILL.md 필수 필드**: `name`, `description`

```yaml
---
name: my-skill
description: "Agent가 이 skill을 언제 활성화할지 판단하는 상세 설명"
---
```

**예시** (`.agent/skills/ensemble-toolkit/SKILL.md`):
```yaml
---
name: ensemble-toolkit
description: "Multi-agent task orchestration tools for Ensemble system. Use when managing tasks, checking status, logging progress."
---
```

→ Agent가 관련 요청 감지 시 자동으로 skill 활성화

### Rules (항상 적용)

**필수 필드**: `trigger`

```yaml
---
name: "규칙 이름"                     # (권장)
description: "규칙 설명"              # (권장)
trigger: always_on                   # (필수) always_on | on_demand
---
```

**예시** (`.agent/rules/ensemble-protocol.md`):
```yaml
---
name: "Ensemble Protocol"
description: "Core protocol rules for Ensemble multi-agent orchestration"
trigger: always_on
---
```

→ 모든 대화에서 자동으로 프로토콜 적용

### 문제 해결

| 증상 | 원인 | 해결책 |
|------|------|--------|
| `/` 입력 시 명령어 안 보임 | `slug` 필드 누락 | YAML frontmatter에 `slug: my-command` 추가 |
| Skill 활성화 안 됨 | 파일 단독 배치 | `skills/my-skill/SKILL.md` 폴더 구조로 변경 |
| Rule 적용 안 됨 | `trigger` 필드 누락 | `trigger: always_on` 추가 |
| 수정 후 반영 안 됨 | IDE 캐시 | Hard Reload 실행 |

**Hard Reload 방법:**
1. Command Palette 열기 (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. `Developer: Reload Window` 선택
3. 채팅창에 `/` 입력하여 명령어 목록 확인

**주의사항:**
- `slug:` 뒤에 공백 필수 (`slug:cmd` ❌ → `slug: cmd` ✅)
- `.agent/` 폴더는 프로젝트 **최상위 루트**에 위치해야 함
- `slug` 값은 프로젝트 내 유일(Unique)해야 함

---

## 3. 기본 사용법: Agent에게 지시하기

### Step 1: 아이디어 전달 (사람 → Agent)

**Antigravity (Gemini):**
```
로그인 API를 만들어줘. JWT 기반으로 하고 refresh token도 지원해야 해.
```

**Claude Code:**
```
회원가입 버그 수정해줘. 이메일 중복 체크가 안 되고 있어.
```

**Codex:**
```
현재 API에 보안 취약점 있는지 점검해줘.
```

> 💡 Agent가 자동으로 `ensemble new` 실행 → Task 생성 → 작업 시작

### Step 2: 승인 요청 시 응답 (Agent → 사람)

Agent가 확인이 필요할 때 질문합니다:

```
🔔 승인 요청:
- 종류: WRITE_DETECTED_CONFIRM
- 내용: src/api/auth.py 파일을 생성하려고 합니다.
- 선택: [1] 승인 [2] 거부

승인하시겠습니까?
```

**응답 방법:**
- "승인" / "1" / "yes" / "ㅇㅇ"
- "거부" / "2" / "no" / "ㄴㄴ"

### Step 3: 결과 확인

```bash
# 완료된 Task 목록
ls .notes/COMPLETED/

# Journal 확인
cat .notes/JOURNAL/*.md

# 현재 상태
ensemble status
```

---

## 3. 실행 모드

### GCC 모드 (팀 협업, 기본값)

```
Gemini(기획) → Claude(구현) → Codex(검증)
```

**적합한 경우:**
- 복잡한 신규 기능
- 보안이 중요한 작업
- 품질 검증이 필요한 경우

**지시 예시:**
```
OAuth2 인증 시스템 만들어줘. 보안 검토까지 해줘.
```

### SOLO 모드 (단일 Agent)

**어떤 Agent든 전체 워크플로우를 단독 수행 가능합니다.**

```
[단일 Agent]
├─ Task 생성 (ensemble new)
├─ 기획/분석
├─ 구현
├─ 자가 검증
└─ 완료 (ensemble close + Journal)
```

**지시 예시:**

| Agent | 지시 | 적합한 작업 |
|-------|------|------------|
| Gemini | "설계 문서만 만들어줘" | 기획, 문서화 |
| Claude | "이 버그 빨리 고쳐줘" | 빠른 구현, 수정 |
| Codex | "보안 점검만 해줘" | 보안 감사, 리뷰 |

---

## 4. 피드백 루프 (Phase 완료 후)

Agent가 작업을 완료한 후에도 피드백을 주면 자동으로 기록됩니다.

### 에러 보고

```
에러 났어. TypeError: Cannot read property 'id' of undefined
```

→ Agent가 자동으로:
1. `ensemble error register` 실행
2. 에러 분석 및 수정
3. `ensemble log` 기록 (피드백 반영)

### 추가 요청

```
잘 됐는데, 비밀번호 재설정 기능도 추가해줘.
```

→ Agent가 자동으로:
1. 기존 Task에 추가 또는 새 Task 생성
2. STEP LOG에 "추가 요청" 기록
3. Journal에 변경 이력 추가

### 수정 요청

```
로그인은 되는데 로그아웃이 안 돼. 수정해줘.
```

→ Agent가 자동으로:
1. `ensemble log --feedback "로그아웃 미작동"` 실행
2. 문제 분석 및 수정
3. Journal 업데이트

---

## 5. 명령어 분류

### 🧑 사람만 사용 (드묾)

| 명령 | 용도 | 언제 사용 |
|------|------|----------|
| `ensemble init-owner` | 프로젝트 소유자 초기화 | 최초 1회 |
| `ensemble metrics` | 메트릭 확인 | 통계 필요 시 |

### 🤖 Agent가 주로 사용 (사람도 가능)

| 명령 | 용도 | Agent 자동 실행 |
|------|------|----------------|
| `ensemble new` | Task 생성 | ✅ 지시 시 자동 |
| `ensemble start` | Task 시작 | ✅ 자동 |
| `ensemble status` | 상태 확인 | ✅ 자동 |
| `ensemble approve` | 질문 승인 | 사람 응답 기반 |
| `ensemble halt` | Task 중단 | 블로커 발생 시 |
| `ensemble dump` | Task 폐기 | 실패 시 |
| `ensemble close` | Task 완료 | ✅ 자동 |
| `ensemble questions` | 질문 관리 | ✅ 자동 |

### 🤖 Agent 전용

| 명령 | 용도 |
|------|------|
| `ensemble log` | 작업/피드백 기록 |
| `ensemble lock` | PAR 모드 파일 락 |
| `ensemble sync` | PAR 모드 동기화 |
| `ensemble error` | 에러 관리 |
| `ensemble triage` | 실패 분석 |
| `ensemble manifest` | 재현성 추적 |
| `ensemble preflight` | 사전 검증 |
| `ensemble impact` | 영향 분석 |
| `ensemble context` | 컨텍스트 생성 |
| `ensemble weekly` | 주간 리포트 |

---

## 6. 질문/승인 시스템

Agent가 확인이 필요할 때 질문합니다.

### 자동 승인 (AUTO)

사람 개입 없이 자동 진행:
- `.notes/` 내부 파일 쓰기
- `git status`, `git diff` 등 읽기 명령
- `python -c "..."` 간단한 검증

### 확인 후 승인 (GUARD)

Agent가 물어보면 승인:
- 새 파일 생성
- 외부 패키지 설치
- 테스트 실행

### 필수 승인 (ASK)

반드시 사람이 확인:
- 기존 파일 수정
- 프로젝트 외부 접근
- 위험한 명령 실행

---

## 7. 상태 관리

### 상태 흐름

```
INBOX → ACTIVE → DONE → COMPLETED
           │
           ├──→ HALTED (재개 가능)
           │
           └──→ DUMPED (폐기)
```

### 중단/폐기

Agent가 블로커를 만나면 자동으로 처리하고 보고합니다:

```
⚠️ Task 중단됨
- 사유: 외부 API 미출시
- 재개 조건: API 출시 후
- Task: .notes/HALTED/TASK-...

재개하시겠습니까?
```

---

## 8. 자주 묻는 질문

### Q: Agent가 Task를 안 만들어요

Agent에게 명확히 지시하세요:
```
이 작업을 Ensemble Task로 만들어서 진행해줘
```

### Q: 승인 요청이 너무 많아요

환경변수로 자동 승인 범위 확대:
```bash
export ENSEMBLE_AUTO_DEFAULT=1
```

### Q: 여러 Agent가 동시에 작업할 수 있나요?

PAR(병렬) 패턴 사용:
```
이 작업을 병렬로 진행해줘. 
Gemini는 문서, Claude는 백엔드, Codex는 보안 담당으로.
```

### Q: 작업 기록은 어디서 봐요?

```bash
# Journal (완료된 작업의 상세 기록)
cat .notes/JOURNAL/*.md

# STEP LOG (진행 중인 작업)
cat .notes/ACTIVE/TASK-*/*.md
```

---

## 9. 요약: 사람이 할 일

| 단계 | 사람이 할 일 | 빈도 |
|------|-------------|------|
| **시작** | 아이디어/요구사항 전달 | 작업당 1회 |
| **진행** | 승인 요청에 응답 | 가끔 |
| **완료** | 결과 확인 | 작업당 1회 |
| **피드백** | 에러/추가사항 전달 | 필요 시 |

**나머지는 전부 Agent가 알아서 합니다.**

---

*Ensemble v4.1.1 Usage Guide — 2026-02-01*
