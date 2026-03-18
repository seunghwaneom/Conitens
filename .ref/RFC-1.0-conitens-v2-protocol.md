# RFC-1.0: Conitens v2 Protocol and State Model

**Status**: APPROVED — Phase 1 착수 기준 문서
**Authors**: Seunghwan Eom (KAIST)
**Date**: 2026-03-17
**Supersedes**: RFC-0, RFC-0.1, v2 아키텍처 보고서(프로토콜 의미론 한정)
**Changelog**:
- RFC-0 → RFC-0.1: 5-plane, spec/projection 분리, memory 분리, redaction, dedupe
- RFC-0.1 → RFC-1.0: sessions/ 제거, StatusReducer replay 정합성, command lifecycle, approval TOCTOU hash, 문서 병합

---

## 0. 한 문장 정의

> **Conitens v2는 이종 CLI 에이전트를 위한 마크다운 네이티브, 이벤트 소싱 협업 OS다.**

---

## 1. 불변식 (Invariants)

| # | 불변식 | 위반 시 결과 |
|---|--------|-------------|
| I-1 | `events/*.jsonl` append가 **유일한 commit point** | 이벤트 없이 상태가 변하면 복구 불가 |
| I-2 | view plane의 모든 파일은 **이벤트 로그만으로** 재생성 가능 | runtime/ 등 휘발성 상태에 의존하면 replay 결정성 파괴 |
| I-3 | 에이전트와 채널 어댑터는 view·entity(reducer 소유) 파일을 **직접 수정하지 않음** | command 또는 mailbox만 제출 |
| I-4 | MODE.md는 **provider binding만** 변경 | 디렉토리/스키마/상태머신/리듀서 불변 |
| I-5 | 모든 외부 발송은 **승인 게이트** 통과 필수 | 미승인 발송 = 보안 위반 |
| I-6 | 이벤트 append 전 **redaction** 필수 실행 | 마스킹 없이 비밀정보가 로그에 영속화되면 유출 |
| I-7 | 각 파일은 **정확히 1개의 소유자**만 가짐 | 소유자 외 수정 시 다음 reducer 실행에서 덮어씌워짐 |

---

## 2. 5-Plane Taxonomy

```
┌──────────────────────────────────────────────────────────────┐
│ Plane 1: CONTROL — 사람이 작성, 드물게 변경                   │
│   MODE.md, agents/*/persona.yaml, agents/*/recall-policy.yaml│
│   policies/*, config/*                                        │
│   소유자: 사람. 에이전트는 변경 제안(patch proposal)만 가능.  │
├──────────────────────────────────────────────────────────────┤
│ Plane 2: COMMAND — 의도 표현, 처리 후 삭제                    │
│   commands/*.md, mailboxes/*/inbox/*.md, approvals/*.md      │
│   소유자: 제출자. 생성 후 불변. 처리 완료 시 삭제.           │
├──────────────────────────────────────────────────────────────┤
│ Plane 3: EVENT — append-only, 유일한 commit point            │
│   events/*.jsonl, traces/*.jsonl                              │
│   소유자: Orchestrator만 append. 수정/삭제 금지.              │
├──────────────────────────────────────────────────────────────┤
│ Plane 4: ENTITY — 비즈니스 객체, 파일별 소유자 지정           │
│   task-specs/*.md (사람/Planner 소유)                         │
│   tasks/*.md (TaskReducer 소유)                               │
│   decisions/*.md (DecisionReducer 소유)                       │
│   handoffs/*.md (HandoffReducer 소유)                         │
│   agents/*/memory.proposed.md (MemoryReducer 소유)            │
│   agents/*/memory.md (사람 승인 후 반영)                      │
├──────────────────────────────────────────────────────────────┤
│ Plane 5: VIEW — 이벤트에서 생성, 읽기 전용                   │
│   views/TASKS.md, views/DECISIONS.md, views/STATUS.md        │
│   views/CONTEXT.md, views/TIMELINE.md                        │
│   runtime/state.sqlite, agents/*/memory.sqlite               │
│   소유자: 지정 Reducer만 생성. 삭제 후 replay로 재생성 가능. │
└──────────────────────────────────────────────────────────────┘
```

### Plane 판별 함수

```typescript
type Plane = "control" | "command" | "event" | "entity" | "view";

function classifyPath(relativePath: string): Plane {
  if (relativePath.startsWith("events/"))           return "event";
  if (relativePath.startsWith("traces/"))           return "event";
  if (relativePath.startsWith("commands/"))         return "command";
  if (relativePath.startsWith("mailboxes/"))        return "command";
  if (relativePath.startsWith("approvals/"))        return "command";
  if (relativePath.startsWith("views/"))            return "view";
  if (relativePath.startsWith("runtime/"))          return "view";
  if (relativePath.startsWith("task-specs/"))       return "entity";
  if (relativePath.startsWith("tasks/"))            return "entity";
  if (relativePath.startsWith("decisions/"))        return "entity";
  if (relativePath.startsWith("handoffs/"))         return "entity";
  if (relativePath.match(/^agents\/[^/]+\/memory/)) return "entity";
  if (relativePath.startsWith("agents/"))           return "control";
  if (relativePath.startsWith("policies/"))         return "control";
  if (relativePath.startsWith("config/"))           return "control";
  if (relativePath === "MODE.md")                   return "control";
  throw new Error(`Unclassified: ${relativePath}`);
}
```

---

## 3. 디렉토리 레이아웃

```
project-root/
├── AGENTS.md                           # [generated]
├── CLAUDE.md                           # [generated]
├── GEMINI.md                           # [generated]
├── CODEX.md                            # [generated]
├── .github/
│   └── copilot-instructions.md         # [generated]
│
└── .conitens/
    ├── MODE.md                         # [control]
    │
    ├── agents/                         # [control + entity]
    │   ├── claude/
    │   │   ├── persona.yaml            # [control]
    │   │   ├── recall-policy.yaml      # [control]
    │   │   ├── memory.proposed.md      # [entity/MemoryReducer]
    │   │   ├── memory.md               # [entity/사람 승인]
    │   │   └── memory.sqlite           # [view/재생성 가능]
    │   ├── codex/ ...
    │   └── gemini/ ...
    │
    ├── task-specs/                     # [entity/사람·Planner 소유]
    │   ├── task-0001.md
    │   └── task-0002.md
    │
    ├── tasks/                          # [entity/TaskReducer 소유]
    │   ├── task-0001.md
    │   └── task-0002.md
    │
    ├── decisions/                      # [entity/DecisionReducer]
    │   └── ADR-0001.md
    │
    ├── handoffs/                       # [entity/HandoffReducer]
    │   └── handoff-20260317-001.md
    │
    ├── mailboxes/                      # [command, 처리 후 삭제]
    │   ├── claude/inbox/
    │   ├── codex/inbox/
    │   ├── gemini/inbox/
    │   └── broadcast/
    │
    ├── commands/                       # [command, 처리 후 삭제]
    │
    ├── approvals/                      # [command, 처리 후 삭제]
    │
    ├── events/                         # [event, append-only]
    │   └── 2026-03-17.jsonl
    │
    ├── views/                          # [view/generated]
    │   ├── TASKS.md
    │   ├── DECISIONS.md
    │   ├── STATUS.md
    │   ├── CONTEXT.md
    │   └── TIMELINE.md
    │
    ├── runtime/                        # [view, .gitignore, 휘발성]
    │   ├── heartbeat-cache/            # live liveness overlay만
    │   ├── locks/
    │   ├── pids/
    │   └── state.sqlite                # dedupe 테이블 포함
    │
    ├── traces/                         # [event, append-only]
    │   └── trace-2026-03-17.jsonl
    │
    ├── policies/                       # [control]
    │   ├── channel-policy.yaml
    │   ├── approval-gates.yaml
    │   ├── security-rules.yaml
    │   └── redaction.yaml
    │
    └── config/                         # [control]
        ├── hub.yaml
        ├── channels.yaml
        └── generator.yaml
```

### sessions/ 처리 방침

> RFC-0의 `sessions/*.jsonl`은 **제거**한다. `message.received`, `message.sent`, `message.internal` 이벤트가 이미 `events/*.jsonl`에 포함되므로, raw transcript의 canonical source는 이벤트 로그로 통일한다. 별도 transcript 파일이 필요하면 exporter view(`conitens export transcript --thread <id>`)로 생성한다.

### .gitignore

```gitignore
.conitens/runtime/
.conitens/agents/*/memory.sqlite
```

---

## 4. 이벤트 스키마

### 4.1 엔벨로프

```typescript
interface ConitensEvent {
  schema: "conitens.event.v1";
  event_id: string;                     // evt_<ulid>
  type: EventType;
  ts: string;                           // ISO 8601 + timezone

  run_id: string;
  task_id?: string;
  causation_id?: string;
  correlation_id?: string;

  actor: {
    kind: "user" | "agent" | "system" | "channel";
    id: string;
  };

  payload: Record<string, unknown>;

  // --- Redaction ---
  redacted?: boolean;
  redacted_fields?: string[];

  // --- Deduplication ---
  idempotency_key?: string;
  source_message_id?: string;

  // --- Approval binding ---
  approval_subject_hash?: string;       // sha256(normalized action payload)
}
```

### 4.2 EventType 정식 사전

```typescript
type EventType =
  // 태스크
  | "task.created"
  | "task.assigned"
  | "task.status_changed"
  | "task.spec_updated"
  | "task.artifact_added"
  | "task.completed"
  | "task.failed"
  | "task.cancelled"
  // 핸드오프
  | "handoff.requested"
  | "handoff.accepted"
  | "handoff.rejected"
  // 결정
  | "decision.proposed"
  | "decision.accepted"
  | "decision.rejected"
  // 승인
  | "approval.requested"
  | "approval.granted"
  | "approval.denied"
  // 에이전트
  | "agent.spawned"
  | "agent.heartbeat"
  | "agent.error"
  | "agent.terminated"
  // 메시지
  | "message.received"
  | "message.sent"
  | "message.internal"
  // 메모리
  | "memory.recalled"
  | "memory.update_proposed"
  | "memory.update_approved"
  | "memory.update_rejected"
  // 모드
  | "mode.switch_requested"
  | "mode.switch_completed"
  // 시스템
  | "system.started"
  | "system.shutdown"
  | "system.reconciliation";
```

### 4.3 Obsolete Aliases (v2 보고서 호환)

| v2 보고서 (obsolete) | RFC-1.0 정식 |
|---------------------|-------------|
| `agent.status.changed` | `agent.heartbeat` 또는 `task.status_changed` |
| `task.updated` | `task.status_changed` |
| `message.new` | `message.received` |
| `artifact.generated` | `task.artifact_added` |
| `approval.required` | `approval.requested` |
| `mode.switching` | `mode.switch_requested` + `mode.switch_completed` |
| `memory.updated` | `memory.update_proposed` → `memory.update_approved` |

Orchestrator는 obsolete alias 수신 시 경고 로그 + 정식 이름으로 변환.

---

## 5. 태스크 상태 머신

### 5.1 상태 전이

```
draft → planned → assigned → active ⇄ blocked
                                ↓
                              review
                           ↙    ↓    ↘
                      active   done   failed → assigned (재할당)
                                       
         (어디서든) → cancelled
```

### 5.2 전이 규칙

```typescript
const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  draft:     ["planned", "cancelled"],
  planned:   ["assigned", "cancelled"],
  assigned:  ["active", "cancelled"],
  active:    ["blocked", "review", "failed", "cancelled"],
  blocked:   ["active", "failed", "cancelled"],
  review:    ["done", "active", "failed"],
  done:      [],
  failed:    ["assigned"],
  cancelled: [],
};
```

Orchestrator는 `VALID_TRANSITIONS`에 없는 전이를 포함하는 이벤트를 거부한다.

### 5.3 Validator 강제 규칙

모든 태스크의 `review → done` 전이에는 `reviewer` 에이전트(또는 사람)의 명시적 승인이 필요하다. Antigravity Swarm의 "모든 팀에 반드시 Validator 포함" 규칙 차용.

---

## 6. Task Spec / Projection 분리

### 6.1 task-specs/task-0007.md (사람/Planner 소유)

```yaml
---
plane: entity
owner: human
task_id: task-0007
title: "OAuth2 마이그레이션"
priority: high
tags: [security, auth]
created_at: 2026-03-17T14:00:00+09:00
dependencies: []
parent_task: null
---

# task-0007: OAuth2 마이그레이션

## 설명
레거시 인증 시스템을 OAuth2 (PKCE)로 전환한다.

## 수락 기준 (Acceptance Criteria)
- [ ] OAuth2 인증 플로우 동작
- [ ] 기존 사용자 세션 마이그레이션
- [ ] 보안 감사 통과
- [ ] 레거시 코드 완전 제거
```

### 6.2 tasks/task-0007.md (TaskReducer 소유)

```yaml
---
plane: entity
owner: TaskReducer
task_id: task-0007
spec: task-specs/task-0007.md
state: active
assigned_to: claude
reviewer: codex
last_event: evt_01J7X9...
do_not_edit: true
---

# task-0007 Projection

## 진행 기록
- 2026-03-17T14:00:00+09:00 — draft (seunghwan)
- 2026-03-17T14:10:00+09:00 — assigned → claude
- 2026-03-17T14:30:00+09:00 — review 요청 (1차 구현 완료)

## 아티팩트
- src/auth/oauth2.py (code)
- tests/auth/test_oauth2.py (test)
```

사양 변경 시: chokidar가 `task-specs/` 변경 감지 → Orchestrator가 `task.spec_updated` 이벤트 발생 → TaskReducer가 projection의 `spec` 참조 갱신. **TaskReducer는 task-specs/ 파일을 절대 수정하지 않는다.**

---

## 7. 핸드오프

상태: `requested → accepted → completed` 또는 `requested → rejected`

핸드오프 파일(`handoffs/handoff-*.md`)은 HandoffReducer 소유. 내용: 목적, 완료 작업, 요청 작업, 핵심 결정, 관련 파일, 제약조건. Google ADK의 narrative casting 패턴 차용 — 이전 에이전트 메시지를 맥락으로 재프레임.

---

## 8. Command Lifecycle

### 8.1 원칙

Command plane 파일(`commands/`, `mailboxes/*/inbox/`, `approvals/`)은 **처리 후 삭제**한다.

근거:
- 이벤트 로그가 이미 canonical audit trail
- command 파일을 보관하면 "이 파일은 처리됐나?"라는 상태를 추가로 관리해야 함
- processed/ 디렉토리는 plane 분류를 모호하게 만듦

### 8.2 흐름

```
채널/사용자/에이전트가 command 파일 생성
    │
    ▼
Orchestrator가 파일 감지 (chokidar)
    │
    ▼
검증 + redaction + dedupe 검사
    │
    ├── 유효 → events/*.jsonl append → command 파일 삭제
    └── 무효 → 에러 이벤트 발생 → command 파일 삭제 + 에러 알림
```

### 8.3 승인 요청/응답

승인 응답도 기존 `approval-*.md` 파일을 **수정하지 않는다**. 대신:

```
approval.requested 이벤트 발생 (approvals/*.md 생성은 UI 표시용)
    │
    ▼
사용자가 새 command 파일로 승인/거부 제출:
  commands/approve-evt_01J7XB.md
  또는
  commands/deny-evt_01J7XB.md
    │
    ▼
Orchestrator가 approval.granted 또는 approval.denied 이벤트 발생
    │
    ▼
command 파일 삭제, approvals/*.md도 삭제
```

---

## 9. Approval Model + TOCTOU 방지

### 9.1 승인 게이트

```yaml
# .conitens/policies/approval-gates.yaml
gates:
  - action: shell_execute
    risk_levels:
      low: auto_approve
      medium: log_and_approve
      high: human_approval
    patterns:
      high: ["rm -rf", "DROP TABLE", "curl", "wget", "ssh"]

  - action: file_write
    rules:
      - path_glob: "src/**"
        approval: auto_approve
      - path_glob: ".env*"
        approval: human_approval
      - path_glob: ".conitens/policies/**"
        approval: human_approval

  - action: channel_send
    rules:
      - contains_code: true
        approval: human_approval
      - contains_secrets: true
        approval: deny
      - default: auto_approve

  - action: task_complete
    approval: validator_required

  - action: persona_change
    approval: human_approval

  - action: memory_curate
    approval: human_review
```

### 9.2 TOCTOU Hash Binding

승인 요청/승인 완료/실행 전에 `approval_subject_hash`를 삽입하여, 승인된 내용과 실행되는 내용의 동일성을 검증한다.

```typescript
function computeSubjectHash(payload: Record<string, unknown>): string {
  // payload를 정규화(키 정렬, 공백 제거)한 뒤 SHA-256
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return sha256(normalized);
}
```

흐름:

```
① approval.requested 이벤트:
   payload.approval_subject_hash = sha256(normalized action payload)

② approval.granted 이벤트:
   payload.approval_subject_hash = 동일 hash (사용자가 본 내용의 hash)

③ 실행 직전:
   Orchestrator가 ①의 hash와 ③의 현재 payload hash를 비교
   불일치 → 실행 거부 + 새로운 approval.requested 발생
```

이벤트 예시:

```jsonl
{"schema":"conitens.event.v1","event_id":"evt_01J7XB...","type":"approval.requested","ts":"...","actor":{"kind":"agent","id":"codex"},"payload":{"action":"shell_execute","command":"npm run test:security","risk_level":"high"},"approval_subject_hash":"a3f2b8c..."}
{"schema":"conitens.event.v1","event_id":"evt_01J7XC...","type":"approval.granted","ts":"...","actor":{"kind":"user","id":"seunghwan"},"causation_id":"evt_01J7XB...","payload":{"original_event":"evt_01J7XB..."},"approval_subject_hash":"a3f2b8c..."}
```

---

## 10. Pre-Append Redaction

### 10.1 적용 시점

이벤트 append **직전**. redaction은 Orchestrator의 write path에 내장.

```
명령 수신 → 검증 → dedupe → redaction → append → reducer
```

### 10.2 기본 패턴

```yaml
# .conitens/policies/redaction.yaml
patterns:
  - name: api_key
    regex: '(?i)(api[_-]?key|apikey|api[_-]?token)\s*[:=]\s*["\x27]?([a-zA-Z0-9_\-]{20,})'
    replacement: "$1=<REDACTED>"
  - name: bearer_token
    regex: '(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}'
    replacement: "Bearer <REDACTED>"
  - name: env_secret
    regex: '(?i)(SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\s*[:=]\s*["\x27]?([^\s"\x27]{8,})'
    replacement: "$1=<REDACTED>"
  - name: connection_string
    regex: '(?i)(postgres|mysql|mongodb|redis)://[^\s"\x27]{10,}'
    replacement: "<REDACTED_CONNECTION_STRING>"
  - name: private_key_block
    regex: '-----BEGIN\s+(RSA\s+)?PRIVATE KEY-----[\s\S]*?-----END'
    replacement: "<REDACTED_PRIVATE_KEY>"

retain_originals: false
```

### 10.3 마스킹 표시

```typescript
// 이벤트에 마스킹 발생 여부를 명시
if (redactionApplied) {
  event.redacted = true;
  event.redacted_fields = ["payload.command", "payload.env"];
}
```

---

## 11. Deduplication

### 11.1 어댑터별 키

| 채널 | `idempotency_key` | `source_message_id` |
|------|-------------------|---------------------|
| Slack | `slack:{team}:{channel}:{event_ts}` | `event.event_ts` |
| Telegram | `telegram:{chat_id}:{message_id}` | `message.message_id` |
| Discord | `discord:{guild}:{channel}:{id}` | snowflake ID |
| WebUI | `webui:{session}:{uuid}` | 클라이언트 UUID |
| CLI | `cli:{pid}:{counter}` | — |

### 11.2 Orchestrator 중복 검사

```typescript
async processCommand(cmd: Command): Promise<void> {
  if (cmd.idempotency_key && await this.dedupeStore.exists(cmd.idempotency_key)) {
    log.warn(`Duplicate ignored: ${cmd.idempotency_key}`);
    return;
  }
  const validated = this.validate(cmd);
  const redacted = this.redact(validated);
  const event = this.toEvent(redacted);
  await this.eventLog.append(event);    // ← commit point
  if (cmd.idempotency_key) {
    await this.dedupeStore.set(cmd.idempotency_key, event.event_id, TTL_24H);
  }
  await this.runReducers(event);
  this.deleteCommandFile(cmd.filePath);  // command 삭제
}
```

DedupeStore: `runtime/state.sqlite`의 dedupe 테이블. TTL 24시간, 주기적 cleanup.

---

## 12. Write Flow (정규 쓰기 경로)

```
사용자 / Slack / Telegram / UI / CLI
            │
     채널 어댑터 → command 파일 생성
            │
  ┌─────────▼─────────────────────┐
  │  Orchestrator                  │
  │  ① command 감지 (chokidar)    │
  │  ② 검증 (상태 전이, 정책)    │
  │  ③ dedupe 검사                │
  │  ④ redaction                  │
  │  ⑤ TOCTOU hash (승인 시)     │
  └─────────┬─────────────────────┘
            │
  ┌─────────▼─────────────────────┐
  │  events/*.jsonl APPEND        │  ← 유일한 commit point
  └─────────┬─────────────────────┘
            │
  ┌─────────▼─────────────────────┐
  │  Reducers                      │
  │  ① entity 파일 갱신           │
  │  ② views/ 재생성              │
  │  ③ runtime/state.sqlite       │
  │  ④ WebSocket 브로드캐스트     │
  └─────────┬─────────────────────┘
            │
  command 파일 삭제
```

### Crash Recovery

```
시스템 재시작 → events/*.jsonl 리플레이 → 모든 entity/view 재생성 → 정상 재개
```

보장: 이벤트 로그가 무결하면 모든 상태가 결정론적으로 복구된다. runtime/ 휘발성 데이터에는 의존하지 않는다.

---

## 13. Reducer 소유권 표

| Reducer | 소유 파일 (쓰기) | 입력 (이벤트) | 참조 (읽기) |
|---------|-----------------|--------------|-------------|
| **TaskReducer** | `tasks/task-*.md`, `views/TASKS.md` | `task.*` | `task-specs/task-*.md` |
| **DecisionReducer** | `decisions/ADR-*.md`, `views/DECISIONS.md` | `decision.*` | — |
| **HandoffReducer** | `handoffs/handoff-*.md` | `handoff.*` | `tasks/task-*.md` |
| **StatusReducer** | `views/STATUS.md` | `agent.spawned`, `agent.heartbeat`, `agent.error`, `agent.terminated` | — |
| **TimelineReducer** | `views/TIMELINE.md` | 모든 이벤트 (최근 N건) | — |
| **ContextReducer** | `views/CONTEXT.md` | `task.completed`, `decision.accepted`, `mode.*` | `task-specs/*`, `decisions/*` |
| **MemoryReducer** | `agents/*/memory.proposed.md` | `decision.accepted`, `task.completed`, `message.*` | — |
| **SQLiteReducer** | `runtime/state.sqlite` | 모든 이벤트 | — |

### StatusReducer replay 정합성

> StatusReducer는 **`agent.*` 이벤트만**을 canonical input으로 사용한다. `runtime/heartbeat-cache/`는 live liveness overlay로서 UI가 참조할 수 있으나, `views/STATUS.md`의 생성에는 사용하지 않는다. 이로써 I-2 불변식(view는 이벤트만으로 재생성 가능)이 유지된다.

UI에서의 에이전트 상태 표시:
- **views/STATUS.md**: 이벤트 기반, replay 가능, 약간의 지연 허용
- **runtime/heartbeat-cache/**: 5초 주기 갱신, 실시간 overlay, replay 불필요

---

## 14. Memory 2단계 구조

```
이벤트 발생 (decision.accepted 등)
    │
    ▼
MemoryReducer → memory.proposed.md에 초안 append
    │
    ▼
memory.update_proposed 이벤트
    │
    ▼
사용자 리뷰 (주간 리포트 또는 즉시)
    │
    ├── 승인 → memory.update_approved 이벤트
    │          → memory.proposed.md에서 항목 제거
    │          → memory.md에 병합
    │          → memory.sqlite 재인덱싱
    │
    └── 거부 → memory.update_rejected 이벤트
               → memory.proposed.md에서 항목 제거
```

에이전트는 자신의 `persona.yaml`을 직접 수정할 수 없다. 변경 제안은 patch proposal(command)로 제출하고 사람이 승인.

### Recall Policy

```yaml
# agents/*/recall-policy.yaml
retrieval:
  strategy: hybrid           # 70% vector + 30% BM25
  min_score: 0.35
  max_results: 10
memory_update:
  auto_draft: true
  auto_commit: false          # 사람 승인 필수
persona_protection:
  self_edit: false
  propose_changes: true
  approval_required: true
```

---

## 15. MODE.md

### 변경하는 것 (provider binding)

```yaml
---
plane: control
mode: antigravity
---
routing:
  planner: gemini
  implementer: claude
  reviewer: codex
  validator: gemini
channels:
  slack: true
  telegram: true
  discord: false
  openclaw_gateway: false
  webui: true
  tui: true
approval:
  shell_high_risk: human_approval
  task_complete: validator_required
ui_default: dashboard
```

### 변경하지 않는 것 (불변)

디렉토리 구조, 이벤트 스키마, 태스크 상태 머신, Reducer 로직, 승인 모델 구조, 핸드오프 프로토콜, 이벤트 로그 위치.

Antigravity↔OpenClaw 전환 = provider binding만 교체. 프로토콜은 동일.

---

## 16. Instruction Generator

### 출력 목록

```
canonical sources:
  .conitens/agents/*/persona.yaml
  .conitens/MODE.md
  .conitens/policies/*.yaml

generated outputs:
  AGENTS.md                               # 범용
  .github/copilot-instructions.md         # Copilot 호환
  CLAUDE.md                               # Claude Code 전용
  GEMINI.md                               # Gemini CLI 전용
  CODEX.md                                # Codex CLI 전용
  skills/*/SKILL.md                       # 스킬 정의
```

모든 생성 파일 상단에 경고:

```markdown
<!-- ⚠️ GENERATED — DO NOT EDIT. Source: .conitens/agents/*/persona.yaml -->
```

트리거: `persona.yaml` 또는 `MODE.md` 변경 시 자동, 또는 `conitens generate` 수동.

---

## 17. 프로토콜 스택

```
Layer 5: A2A       — 원격 에이전트만 (Phase 5+)
Layer 4: MCP       — 에이전트→도구 접근
Layer 3: WebSocket — 로컬 실시간 버스
Layer 2: SQLite    — 인덱스/쿼리 (runtime/state.sqlite)
Layer 1: Files+JSONL+Git — 로컬 진실 & 감사
```

NATS: WebSocket 병목 시에만 도입.

---

## 18. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 런타임 | Node.js ≥22.12.0 + TypeScript | discord.js 요구사항 |
| 패키지 관리 | pnpm ≥9 | — |
| 빌드 | Vite 7 | — |
| 파일 감시 | chokidar | — |
| WebSocket | ws | — |
| Slack | Bolt.js (Socket Mode) | — |
| Telegram | grammY | — |
| Discord | discord.js | — |
| 프론트엔드 | React 19 + Zustand | — |
| 차트 | Recharts | — |
| 칸반 DnD | **dnd-kit** | react-beautiful-dnd deprecated |
| 픽셀아트 | PixiJS 8 | — |
| TUI | Ink | — |
| DB | better-sqlite3 + sqlite-vec | — |
| 트레이싱 | OTEL JSONL + 선택적 Langfuse | — |

---

## 19. conitens doctor --verify 검사 항목

| # | 검사 | 실패 시 |
|---|------|---------|
| 1 | 파일 경로 ↔ plane 분류 일치 (`classifyPath` vs `frontmatter.plane`) | 경고 |
| 2 | entity 파일의 `owner` frontmatter ↔ reducer 소유권 표 일치 | 에러 |
| 3 | `task-specs/`와 `tasks/` 1:1 대응 (orphan 검출) | 경고 |
| 4 | `events/*.jsonl` replay → `views/` 재생성 → 현재 views와 diff 비교 | 에러 (정합성 위반) |
| 5 | `views/STATUS.md`가 `runtime/` 없이 replay만으로 재생성 가능 | 에러 (I-2 위반) |
| 6 | redaction smoke test (알려진 비밀 패턴이 events에 존재하는지) | 에러 |
| 7 | dedupe 테이블 TTL 정리 상태 | 경고 |
| 8 | generated 파일(AGENTS.md 등) ↔ canonical source 동기 여부 | 경고 (drift 감지) |

---

## 20. 실행 로드맵

### Phase 0: Protocol Package (Week 0)

TypeScript 타입 패키지로 프로토콜을 코드에 고정:

```
packages/protocol/
├── src/
│   ├── event.ts           # ConitensEvent, EventType
│   ├── task-state.ts      # TaskState, VALID_TRANSITIONS
│   ├── approval.ts        # ApprovalGate, subjectHash
│   ├── paths.ts           # classifyPath, directory constants
│   ├── ownership.ts       # Reducer↔file ownership map
│   ├── dedupe.ts          # IdempotencyKey, DedupeStore interface
│   ├── redaction.ts       # RedactionPattern, RedactionEngine
│   └── schema-version.ts  # SCHEMA_VERSION = "conitens.event.v1"
└── package.json
```

### Phase 1: Headless Orchestrator (Weeks 1–4)

W1: 디렉토리 초기화 + 이벤트 JSONL writer + reducer framework
W2: tmux agent spawner + git worktree manager
W3: command ingest → orchestrator validation → event append → reducer replay
W4: TUI (Ink) + **kill/replay recovery test**

**Phase 1 MVE**: 3개 CLI 에이전트가 mailbox로 통신하며 태스크 `draft→done` 전체 라이프사이클 완주. 중간에 프로세스 kill → 이벤트 리플레이 → 상태 완전 복구 확인.

### Phase 2: Web Dashboard (Weeks 5–8)

W5: WebSocket 서버 + React 기초
W6: 칸반 (dnd-kit) + 에이전트 상태 패널
W7: 타임라인 (Recharts) + 토큰/비용
W8: 통합 테스트

### Phase 3: Pixel Office (Weeks 9–12)

W9–10: PixiJS 오피스 + Zustand 공유
W11: 영속 메모리 엔진
W12: OTEL 트레이싱

### Phase 4: Channels (Weeks 13–16)

W13: Slack + 정책 게이트
W14: Telegram + Discord
W15: MODE.md 스위칭 + instruction generator
W16: 전채널 통합

### Phase 5: Federation (Weeks 17–20+)

MCP 서버 모드, A2A, 에러 복구 강화, 플러그인 시스템, 오픈소스 릴리즈.

---

## 21. 리스크

| 리스크 | 상태 | 완화 |
|--------|------|------|
| 공유 마크다운 race condition | ✅ 해결 | event-sourced, reducer ownership |
| 모드 폭발 (두 코드패스) | ✅ 해결 | provider binding only |
| 페르소나/메모리 드리프트 | ✅ 해결 | self_edit=false, approval required |
| 지시 파일 드리프트 | ✅ 해결 | canonical→generated + drift 검출 |
| replay 불변식 위반 (StatusReducer) | ✅ 해결 | event-only input, heartbeat-cache는 overlay |
| TOCTOU (승인 후 변조) | ✅ 해결 | approval_subject_hash |
| 이벤트 로그 비밀 유출 | ✅ 해결 | pre-append redaction |
| 채널 재시도 중복 | ✅ 해결 | idempotency_key + dedupe store |
| **이벤트 로그 손상/truncation** | 잔존 | fsync 강제 + 일별 체크포인트 + Git 커밋 |
| **Reducer 버그로 뷰 불일치** | 잔존 | `doctor --verify` replay diff |
| **이벤트 로그 무한 성장** | 잔존 | 일별 분할 + 30일 아카이브 + 체크포인트 |
| **문서 기준선 혼선** | 잔존 | 본 RFC-1.0이 단일 정본. v2 보고서에 superseded 배너 |

---

## 22. 문서 위상

```
RFC-1.0 (본 문서)
  ├── 프로토콜 계약의 유일한 정본
  ├── RFC-0, RFC-0.1을 완전히 대체
  └── Phase 1 착수 기준

v2 아키텍처 보고서
  ├── 전략/시장/UX 비전 문서로서만 유효
  └── 상단에 superseded 배너 필수:
      "Superseded by RFC-1.0 for protocol semantics.
       Obsolete: file-first write path, shared TASKS.md,
       react-beautiful-dnd, v2 event names."
```

---

**다음 산출물**: Phase 0 — `packages/protocol/` TypeScript 패키지.

--- RFC-1.0 끝 ---
