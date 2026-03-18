# RFC-1.0.1: Conitens v2 Protocol and State Model

**Status**: APPROVED — Phase 0 착수 기준 정본
**Authors**: Seunghwan Eom (KAIST)
**Date**: 2026-03-17
**Supersedes**: RFC-0, RFC-0.1, RFC-1.0, RFC-1.0.1-errata, v2 아키텍처 보고서(프로토콜 한정)
**Changelog**:
- RFC-0: 초안
- RFC-0→0.1: 5-plane, spec/projection 분리, memory 분리, redaction, dedupe
- RFC-0.1→1.0: sessions/ 제거, StatusReducer replay, command lifecycle, TOCTOU hash, 문서 병합
- RFC-1.0→1.0.1: approvals/ view 재분류, handoff.completed, operational 분리, MemoryCuratorReducer, command.rejected

---

## 0. 한 문장 정의

> **Conitens v2는 이종 CLI 에이전트를 위한 마크다운 네이티브, 이벤트 소싱 협업 OS다.**

---

## 1. 불변식

| # | 불변식 |
|---|--------|
| I-1 | `events/*.jsonl` append가 **유일한 commit point** |
| I-2 | view plane의 모든 파일은 **이벤트 로그만으로** 재생성 가능 (runtime/operational에 의존 금지) |
| I-3 | 에이전트와 채널 어댑터는 view·entity(reducer 소유) 파일을 **직접 수정하지 않음** |
| I-4 | MODE.md는 **provider binding만** 변경 |
| I-5 | 모든 외부 발송은 **승인 게이트** 통과 필수 |
| I-6 | 이벤트 append 전 **redaction** 필수 |
| I-7 | 각 파일은 **정확히 1개의 소유자(writer)**만 가짐 |

---

## 2. 5-Plane Taxonomy + Operational

```
┌───────────────────────────────────────────────────────────┐
│ Plane 1: CONTROL — 사람이 작성, 드물게 변경               │
│   MODE.md, agents/*/persona.yaml, agents/*/recall-policy  │
│   policies/*, config/*                                     │
├───────────────────────────────────────────────────────────┤
│ Plane 2: COMMAND — 의도 표현, 처리 후 즉시 삭제           │
│   commands/*.md, mailboxes/*/inbox/*.md                    │
├───────────────────────────────────────────────────────────┤
│ Plane 3: EVENT — append-only, 유일한 commit point         │
│   events/*.jsonl, traces/*.jsonl                           │
├───────────────────────────────────────────────────────────┤
│ Plane 4: ENTITY — 비즈니스 객체, 파일별 소유자 지정       │
│   task-specs/*.md (사람/Planner)                           │
│   tasks/*.md (TaskReducer)                                 │
│   decisions/*.md (DecisionReducer)                         │
│   handoffs/*.md (HandoffReducer)                           │
│   agents/*/memory.proposed.md (MemoryReducer)              │
│   agents/*/memory.md (MemoryCuratorReducer, gate=사람승인) │
├───────────────────────────────────────────────────────────┤
│ Plane 5: VIEW — 이벤트에서 생성, 읽기 전용                │
│   views/TASKS.md, views/DECISIONS.md, views/STATUS.md     │
│   views/CONTEXT.md, views/TIMELINE.md, views/APPROVALS.md│
│   runtime/state.sqlite, runtime/heartbeat-cache/          │
│   agents/*/memory.sqlite                                   │
└───────────────────────────────────────────────────────────┘

  OPERATIONAL — 5-plane 바깥, Git 미추적, replay 무관
    runtime/locks/, runtime/pids/
```

### Path Classification

```typescript
type Plane = "control" | "command" | "event" | "entity" | "view";
type PathClass = Plane | "operational";

function classifyPath(p: string): PathClass {
  if (p.startsWith("runtime/locks/"))            return "operational";
  if (p.startsWith("runtime/pids/"))             return "operational";
  if (p.startsWith("events/"))                   return "event";
  if (p.startsWith("traces/"))                   return "event";
  if (p.startsWith("commands/"))                 return "command";
  if (p.startsWith("mailboxes/"))                return "command";
  if (p.startsWith("views/"))                    return "view";
  if (p.startsWith("runtime/"))                  return "view";
  if (p.startsWith("task-specs/"))               return "entity";
  if (p.startsWith("tasks/"))                    return "entity";
  if (p.startsWith("decisions/"))                return "entity";
  if (p.startsWith("handoffs/"))                 return "entity";
  if (p.match(/^agents\/[^/]+\/memory/))         return "entity";
  if (p.startsWith("agents/"))                   return "control";
  if (p.startsWith("policies/"))                 return "control";
  if (p.startsWith("config/"))                   return "control";
  if (p === "MODE.md")                           return "control";
  throw new Error(`Unclassified: ${p}`);
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
    │   │   ├── memory.md               # [entity/MemoryCuratorReducer]
    │   │   └── memory.sqlite           # [view]
    │   ├── codex/ ...
    │   └── gemini/ ...
    │
    ├── task-specs/                     # [entity/사람·Planner]
    │   └── task-0001.md
    ├── tasks/                          # [entity/TaskReducer]
    │   └── task-0001.md
    ├── decisions/                      # [entity/DecisionReducer]
    │   └── ADR-0001.md
    ├── handoffs/                       # [entity/HandoffReducer]
    │   └── handoff-20260317-001.md
    │
    ├── mailboxes/                      # [command, 처리 후 삭제]
    │   ├── claude/inbox/
    │   ├── codex/inbox/
    │   ├── gemini/inbox/
    │   └── broadcast/
    ├── commands/                       # [command, 처리 후 삭제]
    │
    ├── events/                         # [event, append-only]
    │   └── 2026-03-17.jsonl
    │
    ├── views/                          # [view/generated]
    │   ├── TASKS.md
    │   ├── DECISIONS.md
    │   ├── STATUS.md
    │   ├── CONTEXT.md
    │   ├── TIMELINE.md
    │   └── APPROVALS.md
    │
    ├── runtime/                        # [view + operational]
    │   ├── state.sqlite                # [view]
    │   ├── heartbeat-cache/            # [view]
    │   ├── locks/                      # [operational]
    │   └── pids/                       # [operational]
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
  actor: { kind: "user" | "agent" | "system" | "channel"; id: string };
  payload: Record<string, unknown>;
  redacted?: boolean;
  redacted_fields?: string[];
  idempotency_key?: string;
  source_message_id?: string;
  approval_subject_hash?: string;       // sha256(normalized action payload)
}
```

### 4.2 EventType

```typescript
type EventType =
  // 태스크
  | "task.created" | "task.assigned" | "task.status_changed"
  | "task.spec_updated" | "task.artifact_added"
  | "task.completed" | "task.failed" | "task.cancelled"
  // 핸드오프
  | "handoff.requested" | "handoff.accepted"
  | "handoff.rejected" | "handoff.completed"
  // 결정
  | "decision.proposed" | "decision.accepted" | "decision.rejected"
  // 승인
  | "approval.requested" | "approval.granted" | "approval.denied"
  // 에이전트
  | "agent.spawned" | "agent.heartbeat" | "agent.error" | "agent.terminated"
  // 메시지
  | "message.received" | "message.sent" | "message.internal"
  // 메모리
  | "memory.recalled"
  | "memory.update_proposed" | "memory.update_approved" | "memory.update_rejected"
  // 모드
  | "mode.switch_requested" | "mode.switch_completed"
  // 시스템
  | "system.started" | "system.shutdown" | "system.reconciliation"
  // 명령
  | "command.rejected";
```

### 4.3 Obsolete Aliases

| v2 보고서 (사용 금지) | RFC-1.0.1 정식 |
|---------------------|---------------|
| `task.updated` | `task.status_changed` |
| `message.new` | `message.received` |
| `artifact.generated` | `task.artifact_added` |
| `approval.required` | `approval.requested` |
| `mode.switching` | `mode.switch_requested` + `mode.switch_completed` |

---

## 5. 태스크 상태 머신

```typescript
type TaskState =
  | "draft" | "planned" | "assigned" | "active"
  | "blocked" | "review" | "done" | "failed" | "cancelled";

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

`review → done`에는 Validator 에이전트의 명시적 승인 필수.

---

## 6. Task Spec / Projection 분리

**task-specs/task-*.md** — 사람/Planner 소유. 설명, 수락 기준, 태그, 의존성.
**tasks/task-*.md** — TaskReducer 소유. 상태, 할당, 진행 기록, 아티팩트.

TaskReducer는 task-specs/ 파일을 **절대 수정하지 않는다**. 사양 변경 시 `task.spec_updated` 이벤트 발생.

---

## 7. 핸드오프

상태: `requested → accepted → completed` 또는 `requested → rejected`

HandoffReducer 소유. Google ADK narrative casting 패턴 — 이전 에이전트 메시지를 맥락으로 재프레임.

---

## 8. Command Lifecycle

Command plane 파일은 **처리 후 즉시 삭제**.

```
유효 → event append → 삭제
무효 → command.rejected event → 삭제
중복 → command.rejected event (reason: duplicate) → 삭제
```

모든 경로에서 삭제. rejected/ 보관소 없음 — 거부 사유는 이벤트 로그에 기록.

승인 응답: `commands/approve-{evt_id}.md` 또는 `commands/deny-{evt_id}.md`로 제출. 기존 파일 수정 금지.

---

## 9. Approval Model

### 게이트

```yaml
gates:
  - action: shell_execute
    risk_levels: { low: auto_approve, medium: log_and_approve, high: human_approval }
    high_patterns: ["rm -rf", "DROP TABLE", "curl", "wget", "ssh"]
  - action: file_write
    rules:
      - { path_glob: "src/**", approval: auto_approve }
      - { path_glob: ".env*", approval: human_approval }
      - { path_glob: ".conitens/policies/**", approval: human_approval }
  - action: channel_send
    rules:
      - { contains_code: true, approval: human_approval }
      - { contains_secrets: true, approval: deny }
      - { default: auto_approve }
  - action: task_complete
    approval: validator_required
  - action: persona_change
    approval: human_approval
  - action: memory_curate
    approval: human_review
```

### TOCTOU Hash Binding

`approval_subject_hash = sha256(normalized action payload)`를 요청/승인/실행에 삽입. 불일치 시 실행 거부.

### Approval View

ApprovalReducer가 `views/APPROVALS.md`를 생성/갱신. 승인 대기 목록을 보여주는 view projection.

---

## 10. Write Flow

```
채널/사용자/에이전트 → command 파일 생성
    ↓
Orchestrator: 감지 → 검증 → dedupe → redaction → TOCTOU hash
    ↓
events/*.jsonl APPEND  ← commit point
    ↓
Reducers: entity 갱신 + views 재생성 + SQLite + WebSocket broadcast
    ↓
command 파일 삭제
```

### Crash Recovery

`events/*.jsonl` 리플레이 → 모든 entity/view 재생성. operational(locks/pids)은 재생성 불필요.

---

## 11. Reducer 소유권 표

| Reducer | 소유 파일 (writer) | 입력 이벤트 | 참조 (read-only) |
|---------|-------------------|------------|-----------------|
| TaskReducer | `tasks/*.md`, `views/TASKS.md` | `task.*` | `task-specs/*.md` |
| DecisionReducer | `decisions/*.md`, `views/DECISIONS.md` | `decision.*` | — |
| HandoffReducer | `handoffs/*.md` | `handoff.*` | `tasks/*.md` |
| ApprovalReducer | `views/APPROVALS.md` | `approval.*` | — |
| StatusReducer | `views/STATUS.md` | `agent.*` | — |
| TimelineReducer | `views/TIMELINE.md` | 모든 이벤트 (최근 N) | — |
| ContextReducer | `views/CONTEXT.md` | `task.completed`, `decision.accepted`, `mode.*` | `task-specs/*`, `decisions/*` |
| MemoryReducer | `agents/*/memory.proposed.md` | `decision.accepted`, `task.completed`, `message.*` | — |
| MemoryCuratorReducer | `agents/*/memory.md` | `memory.update_approved` | `memory.proposed.md` |
| SQLiteReducer | `runtime/state.sqlite` | 모든 이벤트 | — |

**StatusReducer**: canonical input은 `agent.*` 이벤트만. `runtime/heartbeat-cache/`는 UI용 live overlay만. `views/STATUS.md`는 이벤트만으로 재생성 (I-2 준수).

**MemoryCuratorReducer**: `memory.update_approved` 이벤트 없이 `memory.md` 수정 금지. 사람은 gate, reducer는 writer.

---

## 12. Memory

```
이벤트 → MemoryReducer → memory.proposed.md
       → 사람 리뷰 → approve command → memory.update_approved
       → MemoryCuratorReducer → memory.md → memory.sqlite 재인덱싱
```

recall-policy.yaml: hybrid retrieval (70% vector + 30% BM25), min_score 0.35.
persona.yaml: 에이전트 self_edit=false, propose_changes=true, approval_required=true.

---

## 13. Pre-Append Redaction

```yaml
# policies/redaction.yaml
patterns:
  - { name: api_key, regex: '(?i)(api[_-]?key|apikey|api[_-]?token)\s*[:=]\s*["'']?([a-zA-Z0-9_\-]{20,})', replacement: "$1=<REDACTED>" }
  - { name: bearer_token, regex: '(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}', replacement: "Bearer <REDACTED>" }
  - { name: env_secret, regex: '(?i)(SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\s*[:=]\s*["'']?([^\s"'']{8,})', replacement: "$1=<REDACTED>" }
  - { name: connection_string, regex: '(?i)(postgres|mysql|mongodb|redis)://[^\s"'']{10,}', replacement: "<REDACTED_CONNECTION_STRING>" }
  - { name: private_key_block, regex: '-----BEGIN\s+(RSA\s+)?PRIVATE KEY-----[\s\S]*?-----END', replacement: "<REDACTED_PRIVATE_KEY>" }
retain_originals: false
```

마스킹 발생 시 `redacted: true`, `redacted_fields: [...]` 표시.

---

## 14. Deduplication

어댑터별 `idempotency_key`:

| 채널 | 형식 |
|------|------|
| Slack | `slack:{team}:{channel}:{event_ts}` |
| Telegram | `telegram:{chat_id}:{message_id}` |
| Discord | `discord:{guild}:{channel}:{id}` |
| WebUI | `webui:{session}:{uuid}` |
| CLI | `cli:{pid}:{counter}` |

중복 감지 시 `command.rejected` (reason: duplicate) 발생, command 파일 즉시 삭제. DedupeStore: `runtime/state.sqlite` dedupe 테이블, TTL 24시간.

---

## 15. MODE.md

**변경하는 것**: planner/implementer/reviewer/validator binding, 활성 채널, 승인 정책, UI 기본값.

**변경하지 않는 것**: 디렉토리, 이벤트 스키마, 상태 머신, reducer 로직, 핸드오프 프로토콜.

---

## 16. Instruction Generator

Canonical sources: `agents/*/persona.yaml` + `MODE.md` + `policies/*.yaml`

Generated outputs: `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `skills/*/SKILL.md`

모든 생성 파일 상단: `<!-- ⚠️ GENERATED — DO NOT EDIT -->`

---

## 17. 프로토콜 스택

```
Layer 5: A2A        — 원격 에이전트만 (Phase 5+)
Layer 4: MCP        — 에이전트→도구
Layer 3: WebSocket  — 로컬 실시간 버스
Layer 2: SQLite     — 인덱스/쿼리
Layer 1: Files+JSONL+Git — 로컬 진실 & 감사
```

---

## 18. 기술 스택

Node.js ≥22.12.0, pnpm ≥9, TypeScript, Vite 7, chokidar, ws, Bolt.js, grammY, discord.js, React 19, Zustand, Recharts, **dnd-kit**, PixiJS 8, Ink, better-sqlite3, sqlite-vec, OTEL JSONL + Langfuse(선택).

---

## 19. doctor --verify 검사

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

## 20. 로드맵

**Phase 0** (Week 0): `packages/protocol/` — 타입 + 런타임 검증 + 테스트
**Phase 1** (W1–4): Headless orchestrator — command ingest, event append, reducer replay, TUI, kill/replay recovery
**Phase 2** (W5–8): Web dashboard — WebSocket, 칸반(dnd-kit), 타임라인, 상태
**Phase 3** (W9–12): Pixel office — PixiJS, 영속 메모리, OTEL
**Phase 4** (W13–16): Channels — Slack, Telegram, Discord, MODE switching, generator
**Phase 5** (W17–20+): Federation — MCP server, A2A, 플러그인, 릴리즈

---

## 21. 리스크

| 해결됨 | 잔존 |
|--------|------|
| Race condition → event-sourced | 이벤트 로그 손상 → fsync + checkpoint + Git |
| 모드 폭발 → binding only | Reducer 버그 → doctor --verify |
| 메모리 드리프트 → 2단계 승인 | 로그 무한 성장 → 일별 분할 + 아카이브 |
| TOCTOU → subject hash | 문서 기준선 → 본 RFC-1.0.1이 단일 정본 |
| 비밀 유출 → pre-append redaction | |
| 채널 중복 → idempotency key | |
| StatusReducer replay → event-only | |
| approval ownership → ApprovalReducer view | |
| command orphan → 즉시 삭제 + command.rejected | |

---

**본 문서가 Conitens v2 프로토콜의 유일한 정본이다.**

--- RFC-1.0.1 끝 ---
