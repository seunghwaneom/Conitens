# CLAUDE.md — Conitens v2 Reference Guide

> Reference surface only for the RFC / `.conitens` lineage.
>
> Current active product-line truth in this repository is the Python `ensemble`
> operations layer plus `.notes/` and `.agent/`. For current behavior, prefer
> `AGENTS.md`, `CONITENS.md`, and `docs/adr-0001-control-plane.md`.

## 프로젝트 정의

Conitens v2는 **이종 CLI 에이전트(Claude Code, Gemini CLI, Codex CLI)를 마크다운 네이티브, 이벤트 소싱 프로토콜로 조율하는 로컬퍼스트 협업 OS**다.

핵심 철학: **파일이 프로토콜이다.** 모든 CLI 에이전트가 이미 파일(AGENTS.md, CLAUDE.md, GEMINI.md)로 사고하므로, Conitens의 `.conitens/` 디렉토리가 에이전트의 공용 작업 공간이 된다. 이벤트 로그(`events/*.jsonl`)가 유일한 commit point이고, 마크다운 뷰는 리듀서가 이벤트에서 생성한다.

---

## 정본 문서

**RFC-1.0.1** (`docs/RFC-1.0.1.md`)이 프로토콜의 **유일한 정본**이다. 아키텍처/구현 판단 시 반드시 이 문서를 기준으로 한다. v2 아키텍처 보고서는 전략/시장/UX 비전 문서로서만 유효하고, 프로토콜 의미론은 RFC-1.0.1이 우선한다.

---

## 7대 불변식 — 절대 위반 금지

| # | 불변식 |
|---|--------|
| I-1 | `events/*.jsonl` append가 **유일한 commit point** |
| I-2 | view plane의 모든 파일은 **이벤트 로그만으로** 재생성 가능 (runtime/operational에 의존 금지) |
| I-3 | 에이전트와 채널 어댑터는 view·entity(reducer 소유) 파일을 **직접 수정하지 않음** |
| I-4 | MODE.md는 **provider binding만** 변경 |
| I-5 | 모든 외부 발송은 **승인 게이트** 통과 필수 |
| I-6 | 이벤트 append 전 **redaction** 필수 |
| I-7 | 각 파일은 **정확히 1개의 소유자(writer)**만 가짐 |

코드 작성 시 이 불변식에 위배되는 구현은 즉시 중단하고 대안을 찾는다.

---

## 5-Plane + Operational 분류

모든 `.conitens/` 파일은 아래 중 정확히 하나에 속한다:

```
CONTROL  — 사람이 작성, 드물게 변경
           MODE.md, agents/*/persona.yaml, agents/*/recall-policy.yaml, policies/*, config/*

COMMAND  — 의도 표현, 처리 후 즉시 삭제
           commands/*.md, mailboxes/*/inbox/*.md

EVENT    — append-only, 유일한 commit point
           events/*.jsonl, traces/*.jsonl

ENTITY   — 비즈니스 객체, 파일별 소유자
           task-specs/*.md (사람/Planner 소유)
           tasks/*.md (TaskReducer 소유)
           decisions/*.md (DecisionReducer 소유)
           handoffs/*.md (HandoffReducer 소유)
           agents/*/memory.proposed.md (MemoryReducer 소유)
           agents/*/memory.md (MemoryCuratorReducer 소유, gate=사람승인)

VIEW     — 이벤트에서 생성, 읽기 전용
           views/*.md, runtime/state.sqlite, runtime/heartbeat-cache/, agents/*/memory.sqlite

OPERATIONAL — 5-plane 바깥, Git 미추적, replay 무관
             runtime/locks/, runtime/pids/
```

**판별 코드**: `packages/protocol/src/paths.ts`의 `classifyPath()` 함수를 사용한다. 새 경로를 추가할 때 반드시 이 함수를 업데이트한다.

---

## 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 런타임 | Node.js ≥22.12.0 + TypeScript | discord.js 요구사항으로 인한 바닥 |
| 패키지 관리 | pnpm ≥9 | monorepo workspaces 사용 |
| 빌드 | Vite 7 | 프론트엔드 |
| 파일 감시 | chokidar | command/mailbox 감지 |
| WebSocket | ws | 실시간 버스 |
| DB | better-sqlite3 + sqlite-vec | runtime/state.sqlite |
| 테스트 | vitest | 모든 패키지 |
| TUI | Ink (React for Terminal) | Phase 1 모니터링 |
| Slack | Bolt.js (Socket Mode) | Phase 4 |
| Telegram | grammY | Phase 4 |
| Discord | discord.js | Phase 4 |
| 프론트엔드 | React 19 + Zustand + Recharts + **dnd-kit** + PixiJS 8 | Phase 2–3 |

**금지**: react-beautiful-dnd (deprecated/archived).

---

## 디렉토리 구조

```
conitens/
├── docs/
│   ├── RFC-1.0.1.md                    # 프로토콜 정본
│   └── v2-architecture-report.md       # 비전 문서 (superseded for protocol)
│
├── packages/
│   ├── protocol/                       # @conitens/protocol — 타입 + 검증
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── schema-version.ts       # "conitens.event.v1"
│   │   │   ├── event.ts               # EventType(33종), ConitensEvent, obsolete alias
│   │   │   ├── task-state.ts           # TaskState(9종), HandoffState, 전이 규칙
│   │   │   ├── paths.ts               # classifyPath(), well-known 경로
│   │   │   ├── ownership.ts           # 10개 Reducer 소유권 표, findOwner()
│   │   │   ├── approval.ts            # TOCTOU hash, 고위험 명령 감지
│   │   │   ├── dedupe.ts              # idempotency key, DedupeStore 인터페이스
│   │   │   └── redaction.ts           # 5개 패턴, redactPayload()
│   │   └── tests/
│   │       └── protocol.test.ts        # 50+ 불변식 테스트
│   │
│   ├── core/                           # @conitens/core — Phase 1 구현 대상
│   │   ├── src/
│   │   │   ├── event-log/              # JSONL writer/reader, fsync, 일별 분할
│   │   │   ├── orchestrator/           # command ingest → validate → redact → dedupe → append → reduce
│   │   │   ├── reducers/               # TaskReducer, StatusReducer, ... 10개
│   │   │   ├── agent-spawner/          # tmux 세션 관리
│   │   │   ├── worktree/               # git worktree 자동 생성/병합/정리
│   │   │   ├── replay/                 # crash recovery — events replay → rebuild
│   │   │   └── init/                   # .conitens/ 디렉토리 초기화
│   │   └── tests/
│   │
│   └── tui/                            # @conitens/tui — Ink 기반 터미널 모니터링
│
├── .conitens/                          # 런타임 데이터 (프로토콜 디렉토리)
│   └── ... (RFC-1.0.1 §3 레이아웃 참조)
│
├── AGENTS.md                           # [generated]
├── CLAUDE.md                           # 이 파일
├── package.json                        # monorepo root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## 이벤트 스키마 요약

**33개 EventType** — 전체 목록은 `packages/protocol/src/event.ts` 참조.

주요 카테고리: `task.*`(8종), `handoff.*`(4종), `decision.*`(3종), `approval.*`(3종), `agent.*`(4종), `message.*`(3종), `memory.*`(4종), `mode.*`(2종), `system.*`(3종), `command.rejected`(1종).

**이벤트 엔벨로프 필수 필드**: `schema`, `event_id`(evt_<ulid>), `type`, `ts`, `run_id`, `actor`.
**선택 필드**: `task_id`, `causation_id`, `correlation_id`, `redacted`, `redacted_fields`, `idempotency_key`, `source_message_id`, `approval_subject_hash`.

---

## 정규 Write Flow

```
채널/사용자/에이전트 → command 파일 생성 (.conitens/commands/ 또는 mailboxes/)
    ↓
Orchestrator:
  ① chokidar가 command 파일 감지
  ② 검증 (상태 전이 유효성, 정책 게이트)
  ③ dedupe 검사 (idempotency_key)
  ④ redaction (비밀정보 마스킹)
  ⑤ TOCTOU hash (승인 관련 시)
    ↓
events/*.jsonl APPEND  ← 유일한 commit point (fsync 강제)
    ↓
Reducers 순차 실행:
  ① entity 파일 갱신 (tasks/*.md 등)
  ② views/ 재생성 (TASKS.md, STATUS.md 등)
  ③ runtime/state.sqlite 갱신
  ④ WebSocket 브로드캐스트 (연결된 UI/어댑터에)
    ↓
command 파일 즉시 삭제 (모든 경로에서)
```

**Crash Recovery**: `events/*.jsonl` 리플레이 → 모든 entity/view 재생성. operational(locks/pids)은 재생성 불필요.

---

## Reducer 소유권 표 — 반드시 준수

| Reducer | 소유 파일 (writer) | 입력 이벤트 | 참조 (read-only) |
|---------|-------------------|------------|-----------------|
| TaskReducer | `tasks/*.md`, `views/TASKS.md` | `task.*` | `task-specs/*.md` |
| DecisionReducer | `decisions/*.md`, `views/DECISIONS.md` | `decision.*` | — |
| HandoffReducer | `handoffs/*.md` | `handoff.*` | `tasks/*.md` |
| ApprovalReducer | `views/APPROVALS.md` | `approval.*` | — |
| StatusReducer | `views/STATUS.md` | `agent.*` | — (runtime 읽기 금지, I-2) |
| TimelineReducer | `views/TIMELINE.md` | 모든 이벤트 (최근 N) | — |
| ContextReducer | `views/CONTEXT.md` | `task.completed`, `decision.accepted`, `mode.*` | `task-specs/*`, `decisions/*` |
| MemoryReducer | `agents/*/memory.proposed.md` | `decision.accepted`, `task.completed`, `message.*` | — |
| MemoryCuratorReducer | `agents/*/memory.md` | `memory.update_approved` | `memory.proposed.md` |
| SQLiteReducer | `runtime/state.sqlite` | 모든 이벤트 | — |

**절대 규칙**: TaskReducer는 `task-specs/` 파일을 수정하지 않는다. StatusReducer는 `runtime/`을 읽지 않는다. MemoryCuratorReducer는 `memory.update_approved` 이벤트 없이 동작하지 않는다.

---

## 태스크 상태 머신

```
draft → planned → assigned → active ⇄ blocked
                                ↓
                              review
                           ↙    ↓    ↘
                      active   done   failed → assigned (재할당)
         (어디서든) → cancelled
```

전이 규칙은 `packages/protocol/src/task-state.ts`의 `VALID_TRANSITIONS`에 정의. 이 표에 없는 전이를 구현하면 안 된다. `review → done`에는 Validator 에이전트의 명시적 승인 필수.

---

## 핸드오프 상태 머신

```
requested → accepted → completed
         → rejected
```

---

## Command Lifecycle

command plane 파일은 **처리 후 즉시 삭제**한다. rejected/ 보관소를 만들지 않는다.

```
유효 → event append → 파일 삭제
무효 → command.rejected 이벤트 → 파일 삭제
중복 → command.rejected (reason: duplicate) → 파일 삭제
```

승인 응답: `commands/approve-{evt_id}.md` 또는 `commands/deny-{evt_id}.md`로 제출. 기존 파일 수정 금지.

---

## 보안 규칙

### Pre-Append Redaction (§13)
이벤트 append 전에 `redactPayload()`로 비밀정보를 마스킹한다. 패턴: API 키, Bearer 토큰, 환경변수 시크릿, DB 연결 문자열, 개인키 블록. 마스킹 발생 시 `redacted: true` + `redacted_fields` 표시.

### Deduplication (§14)
채널별 `idempotency_key`로 중복 방지. DedupeStore는 `runtime/state.sqlite`의 dedupe 테이블, TTL 24시간.

### Approval TOCTOU (§9)
`approval_subject_hash = sha256(normalized payload)`를 요청/승인/실행에 삽입. 실행 직전에 hash 비교, 불일치 시 실행 거부.

---

## 코딩 규칙

1. **@conitens/protocol 패키지의 타입과 함수를 반드시 사용한다.** EventType, TaskState, classifyPath(), findOwner(), VALID_TRANSITIONS, redactPayload(), computeSubjectHash() 등을 직접 재구현하지 않는다.

2. **새 파일 경로를 추가할 때** `paths.ts`의 `classifyPath()`를 반드시 업데이트하고, 해당 테스트를 추가한다.

3. **새 Reducer를 추가할 때** `ownership.ts`의 `REDUCERS` 배열을 업데이트하고, 소유권 유일성 테스트를 통과시킨다.

4. **새 EventType을 추가할 때** `event.ts`의 `EVENT_TYPES` 배열에 추가하고, exhaustiveness 테스트를 통과시킨다.

5. **Reducer 구현 시** 반드시 소유권 표의 "소유 파일"만 쓰고, "참조"만 읽는다. 다른 파일을 건드리면 I-7 위반.

6. **view 파일 생성 시** `runtime/` 또는 `operational/` 데이터에 의존하면 I-2 위반. 이벤트만으로 재생성 가능해야 한다.

7. **테스트 우선**: 새 기능 구현 전에 `packages/protocol/tests/protocol.test.ts`의 기존 테스트가 모두 통과하는지 확인한다. 프로토콜 계약을 깨는 변경은 하지 않는다.

8. **ULID 사용**: event_id는 `evt_<ulid>` 형식. 시간 정렬 가능하고 충돌 확률이 극히 낮다.

9. **JSONL 쓰기**: 이벤트 로그는 일별 파일(`YYYY-MM-DD.jsonl`). append 후 `fsync` 강제. 한 줄 = 한 이벤트.

10. **에러 처리**: command 처리 실패 시 `command.rejected` 이벤트를 발생시키고, command 파일을 즉시 삭제한다. 에러를 삼키지 않는다.

---

## Phase 1 구현 범위 (Weeks 1–4)

### Week 1: 기반
- [ ] monorepo 셋업 (pnpm workspace, tsconfig)
- [ ] `packages/protocol/` 테스트 전체 통과 확인
- [ ] `.conitens/` 디렉토리 초기화 스크립트 (`conitens init`)
- [ ] JSONL EventLog writer/reader (`packages/core/src/event-log/`)
  - append(event): fsync 강제, 일별 파일 분할
  - read(date): 특정 날짜 이벤트 스트림
  - replay(): 전체 이벤트 리플레이 (reducer에 공급)

### Week 2: 에이전트 격리
- [ ] tmux Agent Spawner (`packages/core/src/agent-spawner/`)
  - spawnAgent(agentId, command, env): tmux 세션 생성
  - killAgent(agentId): graceful shutdown
  - listAgents(): 실행 중 에이전트 목록
- [ ] Git Worktree Manager (`packages/core/src/worktree/`)
  - createWorktree(agentId, taskId): 브랜치 + worktree 생성
  - mergeWorktree(agentId): main에 --no-ff merge
  - cleanupWorktree(agentId): worktree 제거

### Week 3: 오케스트레이터 + 리듀서
- [ ] Orchestrator (`packages/core/src/orchestrator/`)
  - chokidar로 commands/, mailboxes/ 감시
  - command 검증 → dedupe → redaction → event append → reducer 실행 → command 삭제
  - 상태 전이 검증 (VALID_TRANSITIONS 사용)
- [ ] Reducer Framework
  - BaseReducer 추상 클래스/인터페이스
  - TaskReducer, StatusReducer 최소 구현
  - replay() 함수: 이벤트 전체 리플레이 → entity/view 재생성

### Week 4: TUI + Recovery 테스트
- [ ] TUI (`packages/tui/`) — Ink 기반
  - Agent Status Bar: `[Claude: ■ working TASK-042] [Gemini: □ idle]`
  - Task List: 현재 활성 태스크
  - Live Log: 최신 이벤트 tail
  - Alerts: 승인 필요, 에러
- [ ] **Kill/Replay Recovery Test**: 프로세스 kill → `events/*.jsonl` 리플레이 → 상태 완전 복구 확인
- [ ] 통합 MVE:
  - 3개 CLI 에이전트가 mailbox로 통신
  - 태스크 `draft → done` 전체 라이프사이클 완주
  - 중간 kill → replay → 복구

---

## Phase 1 MVE (최소 검증 실험)

**성공 기준**: 다음 시나리오가 30분 내에 수동/반자동으로 시연 가능.

1. `conitens init`으로 `.conitens/` 디렉토리 생성
2. `task-specs/task-0001.md`를 사람이 작성 (수락 기준 포함)
3. `commands/create-task.md`를 제출 → `task.created` 이벤트 → `tasks/task-0001.md` 생성 (TaskReducer)
4. `commands/assign-task.md` 제출 → `task.assigned` → claude에 할당
5. claude 에이전트가 `mailboxes/codex/inbox/handoff-001.md`로 핸드오프 메시지 전송
6. codex 에이전트가 메시지를 읽고 작업 수행
7. `commands/complete-task.md` 제출 → `task.status_changed` (active→review) → `task.completed` (review→done)
8. `views/TASKS.md`, `views/TIMELINE.md`가 자동 갱신 확인
9. **프로세스 kill → `conitens replay` → 모든 views 동일하게 재생성 확인**

---

## doctor --verify 검사 항목 (구현 시 참조)

| # | 검사 | 실패 시 |
|---|------|---------|
| 1 | path ↔ plane 분류 일치 | 경고 |
| 2 | entity owner frontmatter ↔ reducer 표 일치 | 에러 |
| 3 | task-specs/와 tasks/ 1:1 대응 | 경고 |
| 4 | events/ replay → views/ diff = 0 | 에러 |
| 5 | views/STATUS.md replay-only 재생성 (operational 미사용) | 에러 |
| 6 | redaction smoke test (비밀 패턴 in events) | 에러 |
| 7 | dedupe TTL 정리 | 경고 |
| 8 | generated 파일 ↔ canonical source drift | 경고 |

---

## Obsolete — 사용하지 않는 것

- `sessions/*.jsonl` — 제거됨. raw transcript는 `events/*.jsonl`로 통일.
- `approvals/*.md` 디렉토리 — 제거됨. `views/APPROVALS.md`로 통일.
- `react-beautiful-dnd` — deprecated. `dnd-kit` 사용.
- v2 보고서의 이벤트 이름 (`task.updated`, `message.new`, `artifact.generated` 등) — `event.ts`의 `OBSOLETE_ALIASES` 참조.
- file-first write path — 폐기. event-first write path 사용.
- 공유 mutable TASKS.md — 폐기. `task-specs/` + `tasks/` 분리.

---

## 질문 시 참조 순서

1. 이 CLAUDE.md
2. `docs/RFC-1.0.1.md` (프로토콜 정본)
3. `packages/protocol/src/` (타입 정의)
4. `packages/protocol/tests/protocol.test.ts` (불변식 테스트)
