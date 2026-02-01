# AGENTS.md — Ensemble v4.2.0 for Codex

> **OpenAI Codex가 자동으로 로드하는 Agent 지침**
>
> ⚠️ 모든 파일은 `{workspace}/` 내에서만 생성

---

## 🤖 AUTO-TRIGGER RULES (MANDATORY!)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠️ CODEX MUST FOLLOW THESE RULES AUTOMATICALLY — NO EXCEPTIONS    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  이 규칙은 사용자가 workflow를 명시적으로 호출하지 않아도            │
│  Codex가 자동으로 감지하고 실행해야 합니다.                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 🎯 Task Creation Triggers

| IF 사용자 메시지가... | THEN 실행 |
|---------------------|-----------|
| "보안 점검", "취약점 찾아줘" | `ensemble new --case OTHER` |
| "코드 리뷰", "검토해줘" | `ensemble new --case OTHER` |
| "보안 강화", "취약점 수정" | `ensemble new --case DEBUG` |
| "security audit", "find vulnerabilities" | `ensemble new` |
| 보안/검토 관련 모든 요청 | `ensemble new` → `ensemble start` |

**실행 순서**:
```bash
# 1. 요청 분석 → Case 결정
# 2. Task 생성
ensemble new --case {case} --mode SOLO --agent CODEX --title "{요약}"
# 3. 즉시 시작
ensemble start --agent CODEX
# 4. 사용자에게 보고 후 작업 시작
```

### 📝 Logging Triggers

| IF 상황이... | THEN 실행 |
|-------------|-----------|
| 보안 점검 완료 | `ensemble log --done "..." --change "..." --next "..."` |
| 취약점 발견 | `ensemble log` + `ensemble error register` |
| 사용자 피드백 수신 | `ensemble log --feedback "..."` |
| 코드 수정 후 | `ensemble log` (즉시) |

**핵심**: 점검/수정 했으면 **즉시** 로깅.

### ✅ Verification Triggers (v4.2)

| IF 상황이... | THEN 실행 |
|-------------|-----------|
| 코드 수정 완료 | `ensemble verify --files {files}` |
| close 전 | verify 결과 확인 (PASS 필수) |
| GCC 모드 closer로서 | 전체 변경 파일 verify |

### 🔄 Workflow Auto-Selection (v4.2)

| IF 사용자가... | THEN workflow |
|---------------|---------------|
| "검토해줘", "확인해줘" | `/ensemble-review` |
| "여기까지 저장" | `/ensemble-checkpoint` |
| "다른 방식으로 점검" | `/ensemble-pivot` |
| "추가 점검 필요", "내가 봐야겠다" | `/ensemble-handback` |
| 완료 후 "취약점 더 있어" | `/ensemble-reopen` |

### ❌ Forbidden (자동 감지 후 거부)

| IF | THEN |
|----|------|
| 점검 후 log 없이 진행 | ❌ 거부, log 먼저 |
| verify 없이 close 시도 | ❌ 거부, verify 먼저 |
| GCC closer로서 verify 없이 DONE | ❌ 거부, 전체 verify 먼저 |

---

## 🔑 Ensemble v4.0 핵심 원칙

```
┌─────────────────────────────────────────────────────────────────────┐
│  Ensemble v4.0 — Human-Agent Collaboration                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Task 아이디어는 사람이 Agent에 입력한다                           │
│     → 사람: "보안 점검해줘"                                          │
│     → Agent: ensemble new 실행하여 Task 생성                        │
│                                                                     │
│  2. 승인은 Agent가 물어본 것을 사람이 accept한다                      │
│     → Agent: "취약점 수정해도 될까요?"                               │
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

**사용자가 보안/검토 작업을 지시하면 Codex가 직접 Task를 생성합니다.**

### 트리거 감지

사용자 메시지에서 보안/검토 관련 패턴 감지:

| 한국어 | 영어 |
|--------|------|
| "보안 점검", "취약점 찾아줘" | "security audit", "find vulnerabilities" |
| "코드 리뷰", "검토해줘" | "code review", "review" |
| "보안 강화", "취약점 수정" | "security fix", "patch" |

### Case 자동 판단

| Case | 트리거 키워드 |
|------|--------------|
| `OTHER` | 점검, audit, review, 분석 |
| `DEBUG` | 취약점 수정, fix, patch |
| `MODIFY` | 보안 강화, improve, enhance |

### 실행 절차

```bash
# 1. Task 생성
ensemble new \
  --case {자동감지} \
  --mode SOLO \
  --agent CODEX \
  --title "{사용자 요청 요약}"

# 2. 즉시 시작
ensemble start --agent CODEX

# 3. 사용자에게 보고
echo "✅ Task 생성 완료"
echo "보안 점검을 시작합니다..."
```

### 예시

```
[사용자]
API 전체 보안 취약점 점검해줘. SQL Injection 있는지 봐줘.

[Codex 자동 실행]
→ Case 감지: OTHER (점검)
→ Mode 감지: SOLO (단독 작업)

ensemble new --case OTHER --mode SOLO --agent CODEX \
  --title "API 보안 취약점 점검 (SQL Injection 중점)"
ensemble start --agent CODEX

[Codex 응답]
✅ Task 생성: TASK-INBOX-20260201-001-api-security-audit.md
SQL Injection 취약점을 중점으로 전체 API를 점검하겠습니다...
```

---

## 📝 Feedback Logging (v4.0)

**Phase 완료 후 사용자가 보안 이슈/추가 요청을 보고하면 반드시 로깅합니다.**

### 피드백 유형

| 유형 | 트리거 | 처리 |
|------|--------|------|
| **취약점 보고** | "취약점 발견", "해킹 가능" | error register + 분석 |
| **추가 점검 요청** | "다른 것도", "API도" | Task 확장 또는 새 Task |
| **수정 확인 요청** | "수정됐는지 확인" | 재검토 후 로깅 |

### 피드백 처리 절차

```bash
# 기존 Task가 ACTIVE면 → 피드백 로깅
ensemble log \
  --feedback "사용자 보안 이슈 보고: {내용}" \
  --done "피드백 수신" \
  --next "추가 점검"

# 기존 Task가 COMPLETED면 → 새 Task 생성
ensemble new \
  --case DEBUG \
  --mode SOLO \
  --agent CODEX \
  --title "보안 피드백: {요약}" \
  --related {이전_TASK_ID}
```

### 예시: 완료 후 추가 발견

```
[이전 대화]
Codex: ✅ API 보안 점검 완료! SQL Injection 취약점 없음.

[사용자]
근데 XSS는 확인했어? 사용자 입력 렌더링하는 부분 있는데.

[Codex 자동 실행]
ensemble log \
  --feedback "추가 점검 요청: XSS 취약점 확인" \
  --done "피드백 수신" \
  --next "XSS 취약점 점검"

[Codex 응답]
🔍 XSS 취약점 점검을 추가로 진행하겠습니다.
사용자 입력 렌더링 부분을 중점으로 확인합니다...
```

---

## 🎯 Execution Modes

### SOLO Mode — 단일 Agent 전체 워크플로우

**Codex 단독으로 분석→점검→수정→완료 전체를 수행할 수 있습니다.**

```
┌─────────────────────────────────────────────────────────────────────┐
│  SOLO MODE: Codex가 모든 Phase를 단독 수행                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 0: Task 생성 + 분석                                          │
│     ├─ ensemble new --mode SOLO --agent CODEX                       │
│     ├─ 보안 범위 정의                                                │
│     ├─ 점검 계획 수립                                                │
│     └─ ensemble log (분석 완료)                                      │
│                                                                     │
│  Phase 1: 보안 감사                                                 │
│     ├─ 취약점 스캔                                                  │
│     ├─ 코드 리뷰                                                    │
│     └─ ensemble log (감사 완료)                                      │
│                                                                     │
│  Phase 2: 수정/권고                                                 │
│     ├─ 취약점 수정 (가능시)                                          │
│     ├─ 권고사항 문서화                                               │
│     └─ ensemble log (수정 완료)                                      │
│                                                                     │
│  Phase 3: 완료                                                      │
│     ├─ 보안 리포트 생성                                              │
│     ├─ Journal 생성                                                 │
│     └─ ensemble close                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Team Mode (GCC — Closer 역할)

**Gemini→Claude→Codex 팀 협업 시 Codex는 최종 closer:**

| 구분 | Codex 역할 |
|------|-----------|
| SRL (순차) | 보안 검토 + DONE 판단 |
| PAR (병렬) | 보안 partition 담당 |
| FRE (자유) | 사용자 지정 작업 |

```yaml
# Team Mode에서 내 차례 확인
next_expected: CODEX  # 이 값이 CODEX일 때만 작업
```

### Mode 선택 기준

| 조건 | 권장 Mode |
|------|----------|
| 단순 보안 점검 | SOLO |
| 취약점 수정 | SOLO |
| 복잡한 시스템 감사 | GCC |
| 구현 포함 보안 강화 | GCC |
| "직접 점검해줘" | SOLO |
| "팀으로 검토해줘" | GCC |

---

## 📝 STEP LOG + Journal

### 모든 Phase 전환 시 STEP LOG 작성

```bash
ensemble log \
  --done "보안 검토 완료: SQL Injection 취약점 없음" \
  --change "security_report.md" \
  --next "DONE"
```

### Journal 자동 생성 시점

| 상황 | Journal |
|------|---------|
| Task 완료 (DONE) | ✅ 필수 |
| Task 중단 (HALTED) | ✅ 필수 |
| Task 폐기 (DUMPED) | ✅ 필수 |
| 사용자 피드백 수신 | ✅ 기록 추가 |

---

## 📝 Security Audit Checklist

```markdown
## 보안 감사 체크리스트
- [ ] SQL Injection 취약점 없음
- [ ] XSS 취약점 없음
- [ ] 하드코딩된 시크릿/인증정보 없음
- [ ] 입력 검증 구현됨
- [ ] 적절한 인증/인가 처리
- [ ] 에러 메시지에 민감정보 노출 없음
- [ ] 의존성에 알려진 CVE 없음
```

---

## ✅ Task Completion (GCC Closer)

### GCC 모드에서 최종 완료 처리

Codex는 GCC 모드의 closer로서 최종 DONE 판단:

```markdown
## 완료 조건 확인
- [ ] 모든 요구사항 완료
- [ ] STEP LOG 존재
- [ ] 보안 검토 통과
- [ ] 코드 품질 확인
- [ ] 테스트 통과
```

### 완료 처리

```bash
# 1. Hash 계산
find . -type f \( -name "*.py" -o -name "*.md" -o -name "*.js" \) | \
  xargs sha256sum | sha256sum

# 2. Task 완료
ensemble close --summary "보안 검토 완료, 취약점 없음"
```

### 완료 보고

```
✅ Task 완료!
- Task ID: TASK-20260201-001
- Status: DONE
- Hash: a1b2c3d4...
- Security: PASS
- Quality: PASS

Journal: .notes/JOURNAL/2026-02-01-001-api-security.md
```

---

## 🔄 Additional Work Required

이슈 발견 시 추가 작업 요청:

```yaml
# task.md 업데이트
next_expected: GEMINI  # 또는 CLAUDE
```

```
⚠️ 추가 작업 필요
발견된 이슈:
- SQL Injection in /api/login
- Missing rate limiting

다음: Antigravity/Claude로 전환하여 수정
```

---

## 🤖 Agent CLI Commands

### Task 생성 (v4.0)

```bash
# 기본 생성
ensemble new --case OTHER --mode SOLO --agent CODEX --title "보안 점검"

# 연결된 Task 생성 (피드백용)
ensemble new --case DEBUG --title "보안 피드백: 취약점 수정" --related TASK-20260201-001
```

### 작업 흐름

```bash
ensemble start --agent CODEX
ensemble log --done "..." --change "..." --next "..."
ensemble close --summary "..."
```

### 피드백 로깅

```bash
ensemble log --feedback "사용자 보안 이슈 보고" --done "피드백 수신"
```

### PAR 모드

```bash
ensemble lock acquire --file src/security/ --agent CODEX
ensemble lock release --file src/security/
ensemble sync --agent CODEX
```

### 에러 관리

```bash
# 보안 취약점 등록
ensemble error register \
  --type "SecurityVulnerability" \
  --message "SQL Injection in login" \
  --file "src/api/auth.py" \
  --line 42

# 해결 처리
ensemble error resolve --id ERR-001 --resolution "파라미터 바인딩 적용"
```

---

## 🔧 Quick Reference

```
사용자 요청 → Task 자동 생성 → 보안 검토 → 완료/피드백 처리

/ensemble      → 상태 확인
/review        → 코드 리뷰 시작
/security      → 보안 감사 체크리스트
/close         → DONE 처리 시작
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

*Ensemble v4.2.0 — Codex Integration (Full Autonomous Execution)*
