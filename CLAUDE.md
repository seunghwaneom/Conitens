# CLAUDE.md — Ensemble v5.0.0 for Claude Code

> **Claude Code가 자동으로 로드하는 프로젝트 컨텍스트**
>
> ⚠️ 모든 파일은 `{workspace}/` 내에서만 생성

---

## 🤖 AUTO-TRIGGER RULES (MANDATORY!)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠️ CLAUDE MUST FOLLOW THESE RULES AUTOMATICALLY — NO EXCEPTIONS   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  이 규칙은 사용자가 workflow를 명시적으로 호출하지 않아도            │
│  Claude가 자동으로 감지하고 실행해야 합니다.                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 🎯 Task Creation Triggers

| IF 사용자 메시지가... | THEN 실행 |
|---------------------|-----------|
| "~해줘", "~만들어줘", "~고쳐줘" | `ensemble new` → `ensemble start` |
| "~구현해줘", "~수정해줘", "~추가해줘" | `ensemble new` → `ensemble start` |
| "create", "build", "fix", "implement" | `ensemble new` → `ensemble start` |
| "버그", "에러", "안 돼" | `ensemble new --case DEBUG` |
| 작업 지시로 보이는 모든 요청 | `ensemble new` → `ensemble start` |

**실행 순서**:
```bash
# 1. 요청 분석 → Case/Mode 결정
# 2. Task 생성
ensemble new --case {case} --mode SOLO --agent CLAUDE --title "{요약}"
# 3. 즉시 시작
ensemble start --agent CLAUDE
# 4. 사용자에게 보고 후 작업 시작
```

### 📝 Logging Triggers

| IF 상황이... | THEN 실행 |
|-------------|-----------|
| 코드 작성/수정 완료 | `ensemble log --done "..." --change "..." --next "..."` |
| 사용자 피드백/에러 보고 | `ensemble log --feedback "..." --done "피드백 수신"` |
| Phase 전환 | `ensemble log` |
| 파일 생성/수정 후 | `ensemble log` (즉시, 나중에 하지 않음) |

**핵심**: 코드를 작성했으면 **즉시** 로깅. "나중에 기록" 금지.

### ✅ Verification Triggers (v4.2)

| IF 상황이... | THEN 실행 |
|-------------|-----------|
| `.py`, `.js`, `.ts` 파일 생성/수정 | `ensemble verify --files {files}` |
| 구현 완료 후 close 전 | `ensemble verify` (필수!) |
| verify FAIL | 에러 수정 → 재검증 |
| close 시도 시 verify 미실행 | ❌ 거부, verify 먼저 |

**강제 규칙**: `close` 전에 `verify PASS` 필수!

### 🔄 Workflow Auto-Selection (v4.2)

| IF 사용자가... | THEN workflow |
|---------------|---------------|
| "봐줘", "검토해줘", "확인해줘" | `/ensemble-review` |
| "여기까지 좋아", "저장해" | `/ensemble-checkpoint` |
| "그거 말고", "다른 방식으로" | `/ensemble-pivot` |
| "내가 해야 할 것 같아" | `/ensemble-handback` |
| 완료 후 "에러 나", "안 돼" | `/ensemble-reopen` |

### ❌ Forbidden (자동 감지 후 거부)

| IF | THEN |
|----|------|
| 코드 작성 후 log 없이 진행 | ❌ 거부, log 먼저 |
| verify 없이 close 시도 | ❌ 거부, verify 먼저 |
| verify FAIL 상태에서 close | ❌ 거부, 수정 후 재검증 |
| STEP LOG 없이 Phase 전환 | ❌ 거부, log 먼저 |

---

## 🔑 Ensemble v4.0 핵심 원칙

```
┌─────────────────────────────────────────────────────────────────────┐
│  Ensemble v4.0 — Human-Agent Collaboration                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Task 아이디어는 사람이 Agent에 입력한다                           │
│     → 사람: "로그인 기능 만들어줘"                                   │
│     → Agent: ensemble new 실행하여 Task 생성                        │
│                                                                     │
│  2. 승인은 Agent가 물어본 것을 사람이 accept한다                      │
│     → Agent: "파일을 생성해도 될까요?"                               │
│     → 사람: "승인" 또는 "거부"                                       │
│                                                                     │
│  3. 모든 실행은 ensemble을 바탕으로 Agent가 진행한다                  │
│     → Task 생성, 기록, 완료 모두 Agent가 ensemble 명령 실행          │
│                                                                     │
│  4. 모든 상태는 task.md에 적히고 모든 Agent는 이것을 참고한다         │
│     → task.md = Single Source of Truth                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Protocol Rules

| 규칙 | 설명 |
|------|------|
| STEP LOG MANDATORY | 모든 Phase 전환 시 `ensemble log` 실행 |
| **VERIFY BEFORE CLOSE** | 코드 변경 시 `ensemble verify` 필수 (L1/L2 PASS) |
| JOURNAL ON DONE | 완료/중단/폐기 시 Journal 자동 생성 |
| FEEDBACK LOGGING | 사용자 피드백(에러/추가요청) 반드시 기록 |
| HASH AUDIT TRAIL | SHA-256으로 변경 추적 |

---

## 🆕 Task Creation (v4.0)

**사용자가 작업을 지시하면 Claude가 직접 Task를 생성합니다.**

### 트리거 감지

사용자 메시지에서 작업 요청 패턴 감지:

| 한국어 | 영어 |
|--------|------|
| "~해줘", "~만들어줘", "~고쳐줘" | "create", "build", "fix", "implement" |
| "~추가해줘", "~수정해줘" | "add", "modify", "update" |
| "~버그", "~에러" | "bug", "error", "issue" |

### Case 자동 판단

| Case | 트리거 키워드 |
|------|--------------|
| `NEW_BUILD` | 새로운, create, build, 만들어 |
| `MODIFY` | 수정, 개선, update, improve |
| `DEBUG` | 버그, 에러, fix, error |
| `OTHER` | 문서, 분석, review, docs |

### Mode 자동 판단

| Mode | 조건 |
|------|------|
| `GCC` | 복잡한 작업, 보안 검토 필요 |
| `SOLO --agent CLAUDE` | 빠른 수정, 단순 작업, "직접 해줘" |

### 실행 절차

```bash
# 1. Task 생성
ensemble new \
  --case {자동감지} \
  --mode {자동감지 또는 SOLO} \
  --agent CLAUDE \
  --title "{사용자 요청 요약}"

# 2. 즉시 시작
ensemble start --agent CLAUDE

# 3. 사용자에게 보고
echo "✅ Task 생성 완료: TASK-INBOX-{date}-{num}-{desc}.md"
echo "작업을 시작합니다..."
```

### 예시

```
[사용자]
로그인 API에서 토큰 만료 처리가 안 돼. 고쳐줘.

[Claude 자동 실행]
→ Case 감지: DEBUG (에러, 고쳐줘)
→ Mode 감지: SOLO (빠른 수정)

ensemble new --case DEBUG --mode SOLO --agent CLAUDE \
  --title "로그인 토큰 만료 처리 수정"
ensemble start --agent CLAUDE

[Claude 응답]
✅ Task 생성: TASK-INBOX-20260201-001-login-token-fix.md
원인을 분석하고 수정하겠습니다...
```

---

## 📝 Feedback Logging (v4.0)

**Phase 완료 후 사용자가 에러/추가 요청을 보고하면 반드시 로깅합니다.**

### 피드백 유형

| 유형 | 트리거 | 처리 |
|------|--------|------|
| **에러 보고** | "에러 나", "안 돼", "버그가" | error register + 수정 |
| **추가 요청** | "추가로", "더", "also" | 기존 Task 확장 또는 새 Task |
| **수정 요청** | "변경해줘", "바꿔줘" | log --feedback + 수정 |

### 에러 보고 처리

```bash
# 1. 에러 등록
ensemble error register \
  --type "{에러 유형}" \
  --message "{에러 메시지}" \
  --file "{파일 경로}" \
  --line {라인 번호}

# 2. STEP LOG에 피드백 기록
ensemble log \
  --feedback "사용자 에러 보고: {요약}" \
  --done "에러 수신 및 분석" \
  --change "None yet" \
  --next "수정 진행"

# 3. 수정 후
ensemble log \
  --done "에러 수정 완료: {내용}" \
  --change "{수정된 파일}" \
  --next "검증"
```

### 추가 요청 처리

```bash
# 기존 Task가 ACTIVE 상태면 → 확장
ensemble log \
  --feedback "추가 요청: {내용}" \
  --done "요청 수신" \
  --next "추가 구현"

# 기존 Task가 COMPLETED 상태면 → 새 Task 생성
ensemble new \
  --case MODIFY \
  --mode SOLO \
  --agent CLAUDE \
  --title "추가: {요청 요약}" \
  --related {이전_TASK_ID}
```

### 예시: 완료 후 에러 보고

```
[이전 대화]
Claude: ✅ 로그인 API 구현 완료!

[사용자]
근데 새로고침하면 로그인이 풀려. 세션 유지가 안 되는 것 같아.

[Claude 자동 실행]
# 1. 기존 Task 상태 확인
ensemble status
# → TASK-20260201-001: COMPLETED

# 2. 새 Task 생성 (연결)
ensemble new --case DEBUG --mode SOLO --agent CLAUDE \
  --title "세션 유지 오류 수정" \
  --related TASK-20260201-001

# 3. 시작
ensemble start --agent CLAUDE

[Claude 응답]
🔗 이전 Task(로그인 API)와 연결된 수정 Task를 생성했습니다.
세션 유지 문제를 분석하겠습니다...
```

---

## 🎯 Execution Modes

### SOLO Mode — 단일 Agent 전체 워크플로우

**Claude 단독으로 기획→구현→검증→완료 전체를 수행할 수 있습니다.**

```
┌─────────────────────────────────────────────────────────────────────┐
│  SOLO MODE: Claude가 모든 Phase를 단독 수행                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 0: Task 생성 + 분석                                          │
│     ├─ ensemble new --mode SOLO --agent CLAUDE                      │
│     ├─ 요구사항 분석                                                 │
│     ├─ 작업 계획 수립                                                │
│     └─ ensemble log (분석 완료)                                      │
│                                                                     │
│  Phase 1: 구현                                                      │
│     ├─ 코드 작성                                                    │
│     ├─ 테스트 작성/실행                                              │
│     └─ ensemble log (구현 완료)                                      │
│                                                                     │
│  Phase 2: 자가 검증                                                 │
│     ├─ 코드 리뷰 (self-review)                                       │
│     ├─ 보안 체크리스트                                               │
│     ├─ 에러 핸들링 확인                                              │
│     └─ ensemble log (검증 완료)                                      │
│                                                                     │
│  Phase 3: 완료                                                      │
│     ├─ Hash 계산                                                    │
│     ├─ Journal 생성                                                 │
│     └─ ensemble close                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Team Mode (GCC)

**Gemini→Claude→Codex 팀 협업 시:**

| 구분 | Claude 역할 |
|------|------------|
| SRL (순차) | 구현 담당, `next_expected: CLAUDE` 확인 후 작업 |
| PAR (병렬) | 할당된 partition만 작업 |
| FRE (자유) | 사용자 지정 작업 |

```yaml
# Team Mode에서 내 차례 확인
next_expected: CLAUDE  # 이 값이 CLAUDE일 때만 작업
```

### Mode 선택 기준

| 조건 | 권장 Mode |
|------|----------|
| 빠른 버그 수정 | SOLO |
| 단순 기능 추가 | SOLO |
| 복잡한 신규 기능 | GCC |
| 보안 검토 필요 | GCC |
| "직접 해줘" 지시 | SOLO |
| "팀으로 해줘" 지시 | GCC |

---

## 📝 STEP LOG + Journal

### 모든 Phase 전환 시 STEP LOG 작성

```bash
ensemble log \
  --done "구현 완료: 토큰 갱신 로직" \
  --change "src/api/auth.py, src/utils/token.py" \
  --next "@Codex - 보안 검토"  # 또는 "DONE"
```

### Journal 자동 생성 시점

| 상황 | Journal |
|------|---------|
| Task 완료 (DONE) | ✅ 필수 |
| Task 중단 (HALTED) | ✅ 필수 |
| Task 폐기 (DUMPED) | ✅ 필수 |
| 사용자 피드백 수신 | ✅ 기록 추가 |

---

## ✅ Task Completion

### 완료 조건 확인

```markdown
- [ ] 모든 요구사항 완료
- [ ] STEP LOG 1개 이상 존재
- [ ] (SOLO) 자가 검증 완료
- [ ] 테스트 통과
```

### 완료 처리

```bash
# 1. Hash 계산
find . -type f \( -name "*.py" -o -name "*.md" -o -name "*.js" \) | \
  xargs sha256sum | sha256sum

# 2. Task 완료
ensemble close --summary "작업 요약"
```

### 완료 보고

```
✅ Task 완료!
- Task ID: TASK-20260201-001
- Hash: a1b2c3d4...
- Journal: .notes/JOURNAL/2026-02-01-001-login-api.md
```

---

## 🤖 Agent CLI Commands

### Task 생성 (v4.0)

```bash
# 기본 생성
ensemble new --case DEBUG --mode SOLO --agent CLAUDE --title "버그 수정"

# 연결된 Task 생성 (피드백용)
ensemble new --case DEBUG --title "피드백: 추가 수정" --related TASK-20260201-001
```

### 작업 흐름

```bash
ensemble start --agent CLAUDE
ensemble log --done "..." --change "..." --next "..."
ensemble close --summary "..."
```

### 피드백 로깅

```bash
ensemble log --feedback "사용자 피드백 내용" --done "피드백 수신"
```

### PAR 모드

```bash
ensemble lock acquire --file src/api.py --agent CLAUDE
ensemble lock release --file src/api.py
ensemble sync --agent CLAUDE
```

### 분석/진단

```bash
ensemble impact --files src/api.py
ensemble triage --run-id RUN-001
ensemble preflight --task TASK-ID
```

### 에러 관리

```bash
ensemble error register --type "TypeError" --message "..." --file "..." --line 42
ensemble error resolve --id ERR-001 --resolution "..."
```

---

## 📋 Self-Review Checklist (SOLO)

```markdown
## 자가 검증 체크리스트
- [ ] 요구사항 충족
- [ ] 명백한 버그 없음
- [ ] 에러 핸들링 적절
- [ ] 하드코딩된 시크릿 없음
- [ ] 입력 검증 구현
- [ ] 테스트 존재 및 통과
```

---

## ⏸️ Task Halt / 🗑️ Task Dump

### 중단 (재개 가능)

```bash
ensemble halt \
  --reason BLOCKER \
  --desc "외부 API 미출시" \
  --resume "API 출시 후"
```

### 폐기 (재개 불가)

```bash
ensemble dump \
  --reason FAILURE \
  --desc "기술적 제약" \
  --lesson "사전 조사 필수"
```

---

## 🔧 Quick Reference

```
사용자 요청 → Task 자동 생성 → 작업 → 완료/피드백 처리

/ensemble          → 상태 확인
/task              → 현재 Task 읽기
/log               → STEP LOG 템플릿
/solo-review       → 자가 검증 체크리스트
```

---

## 🔗 Multi-Agent Workspace (v5.0)

### 서버 시작

다중 Agent 협업 시 Context Sync Server를 먼저 시작합니다:

```bash
# 서버 상태 확인
ensemble server status

# 서버 시작 (백그라운드)
ensemble server start --background

# 또는 포그라운드 (디버깅용)
ensemble server start --port 9999
```

### Agent로 연결

```bash
# Claude Code 인스턴스로 연결
ensemble connect --agent CLAUDE --instance terminal-1

# 파티션 지정 (특정 디렉토리만 담당)
ensemble connect --agent CLAUDE --instance frontend --partition src/frontend/
ensemble connect --agent CLAUDE --instance backend --partition src/backend/
```

### 다중 터미널 워크플로우

```
┌─────────────────────────────────────────────────────────────────────┐
│  MULTI-TERMINAL WORKFLOW                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Terminal 1: ensemble server start --background                     │
│                                                                     │
│  Terminal 2: ensemble connect --agent CLAUDE --instance term-1      │
│              → Frontend 작업                                        │
│                                                                     │
│  Terminal 3: ensemble connect --agent CLAUDE --instance term-2      │
│              → Backend 작업                                         │
│                                                                     │
│  Terminal 4: ensemble connect --agent CODEX --instance reviewer     │
│              → 실시간 코드 리뷰                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 실시간 이벤트

| 수신 이벤트 | 처리 |
|------------|------|
| `file:changed` | Context 갱신, 영향 분석 |
| `lock:acquired` | 해당 파일 편집 회피 |
| `review:requested` | (Codex 역할 시) 리뷰 시작 |
| `plan:proposed` | (계획 검토) 확인/제안 |

### Lock 프로토콜

파일 수정 전 반드시 Lock 획득:

```bash
# Lock 획득
ensemble lock acquire --file src/api.py --agent CLAUDE

# 작업 수행...

# Lock 해제
ensemble lock release --file src/api.py --agent CLAUDE
```

### 대시보드

```bash
# 현재 상태 확인
ensemble dashboard

# 출력 예시:
# Active Agents: 3
#   - CLAUDE-term-1 (src/frontend/)
#   - CLAUDE-term-2 (src/backend/)
#   - CODEX-reviewer (no partition)
# Active Locks: 2
#   - src/api.py: CLAUDE-term-2 (EXCLUSIVE)
#   - src/auth.py: CLAUDE-term-1 (EXCLUSIVE)
```

---

## 🛠️ Skills & Tools Reference

> **Full Reference**: See @.agent/skills/ensemble-toolkit/SKILL.md for complete tool documentation

### Quick Tool Reference

| Tool | Command | Purpose |
|------|---------|---------|
| **Preflight** | `python scripts/ensemble_preflight.py check --task TASK-ID` | 작업 전 검증 |
| **Impact** | `python scripts/ensemble_impact.py analyze --file {file}` | 변경 영향 분석 |
| **Context** | `python scripts/ensemble_context.py generate` | 컨텍스트 갱신 |
| **Triage** | `python scripts/ensemble_triage.py analyze --task TASK-ID` | 실패 원인 분석 |
| **Manifest** | `python scripts/ensemble_manifest.py create --task TASK-ID` | 재현성 추적 |
| **Weekly** | `python scripts/ensemble_weekly.py generate` | 주간 리포트 |

### Workflow Integration

**Before Starting Work:**
```bash
python scripts/ensemble_context.py generate
python scripts/ensemble_preflight.py check --task TASK-ID
python scripts/ensemble_impact.py analyze --file {target_file}
```

**After Failure:**
```bash
python scripts/ensemble_triage.py analyze --task TASK-ID
ensemble error findings
```

**Weekly Review:**
```bash
python scripts/ensemble_weekly.py generate
python scripts/ensemble_weekly.py trends
```

---

*Ensemble v5.0.0 — Multi-Agent Workspace Edition (Full Autonomous Execution)*
