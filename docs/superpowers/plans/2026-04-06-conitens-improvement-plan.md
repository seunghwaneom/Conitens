# Conitens Improvement Implementation Plan (v2)

> Date: 2026-04-06
> Source: `Conitens_개선계획안_2026-04-06.md`
> Status: **APPROVED** — Ralplan consensus reached (Iteration 2)
> Revision: v2.1 — Event-first architecture, migration mapping, API contracts, Critic reservations applied

---

## RALPLAN-DR Summary

### Principles (5)

1. **Events-are-Canonical**: `events/*.jsonl` append가 유일한 commit point (I-1 준수). `.notes/` Markdown은 이벤트로부터 생성되는 **projection(view)** 이다. Markdown은 human-readable 열람용이지만, 정본은 event log이다.
2. **Additive Extension Only**: `scripts/ensemble.py` core를 대체하지 않고 `ensemble_*.py` 모듈을 추가해 확장한다 (ADR-0001 준수).
3. **Token-Aware by Default**: 기록은 풍부하게, 프롬프트에는 L0/L1만 넣는다. Full transcript auto-load 금지.
4. **Approval-Gated Self-Improvement**: 에이전트 자기수정은 candidate patch → review → approval 경로만 허용.
5. **CLI-First, UI-Second**: background 운영은 터미널 CLI가 primary, dashboard는 열람/모니터링 보조.

### Decision Drivers (Top 3)

1. **I-1/I-2 불변식 준수 필수** — event JSONL이 sole commit point. 모든 새 기능(comms, agent registry, improver)은 event를 먼저 발행하고 `.notes/`에는 projection만 쓴다.
2. **Dashboard에 routes/screens 3개만 존재** — Thread Browser, Agent Studio, Approvals가 전혀 없어 사용자 열람 불가. 각 화면에 Forward Bridge API contract가 선행 필요.
3. **`.notes/` 기존 12개 디렉토리와 새 Obsidian 구조의 공존 전략** — 마이그레이션 매핑이 확정되어야 Batch 0를 시작할 수 있다.

### Viable Options

#### Option A: 6-Batch 순차 실행 + Event-first 재설계 (Recommended)
- **Pros**: 불변식 준수, 점진적 가치 전달, 각 Batch 독립 완료 기준 보유, event replay로 `.notes/` 재생성 가능
- **Cons**: 6주 + 3일 소요 (Batch 0 확장), event pipeline 구축 오버헤드
- **Risk**: Batch 0가 5-7일로 늘어남. Mitigation: schema + event types를 병렬 진행, 7일 time-box.
- **Rollback**: 각 Batch는 독립 커밋. Batch N 실패 시 git revert로 Batch N-1 상태 복원.

#### Option B: Batch 0+1 병합 후 핵심 기능 우선 구현
- **Pros**: ADR + Agent Registry 동시 진행으로 2-3일 절약
- **Cons**: event types 미확정 상태에서 agent registry 구현 → schema 변경 시 rework. ADR-0002 미확정으로 `.notes/` 구조 결정 없이 agent card 경로 충돌 가능.
- **Risk**: 정량적으로 50%+ 확률로 schema rework 발생 (event types가 agent lifecycle에 영향)

#### Option C: Dashboard UI 먼저, Backend 나중
- **Invalidation**: Forward Bridge가 comms/agent 도메인 API를 제공하지 않으면 UI 화면에 데이터 없음. `ensemble_forward_bridge.py`에 현재 `/api/threads`, `/api/agents` 엔드포인트 없음 (확인됨). Backend-first 필수.

### Selected: Option A (Event-first 6-Batch) with Batch 0 확장 (+3일)

---

## `.notes/` Migration Mapping (신규 추가)

현재 `.notes/` 12개 디렉토리 → Obsidian numbered 구조 매핑:

| 기존 디렉토리 | 매핑 대상 | 처리 |
|---|---|---|
| `ACTIVE/` | `00_Inbox/` | 이동. `_pending_questions.json` → frontmatter MD로 변환 |
| `agents/` | (삭제 예정) | 비어있음. `.agent/agents/`가 정본 |
| `artifacts/` | `80_Archive/artifacts/` | 이동. `manifest.jsonl` 보존 |
| `context/` | (루트 유지) | `LATEST_CONTEXT.md`는 `.vibe/` sidecar 역할. 이동 불필요 |
| `EVENTS/` | (루트 유지) | event log 정본. 이동 금지 |
| `gates/` | `80_Archive/gates/` | 이동. 기존 `G-*.json` 파일 보존 |
| `MEETINGS/` | `80_Archive/meetings/` | 이동. summaries/ 보존 |
| `OFFICE/` | `80_Archive/office/` | 이동. office metaphor 후순위 |
| `recovery/` | `80_Archive/recovery/` | 이동. 2026-03-18 아카이브 보존 |
| `RESEARCH/` | `70_Reviews/research/` | 이동. agent-orchestration report 보존 |
| `rooms/` | `40_Comms/legacy-rooms/` | 이동. 기존 room JSONL 보존 |
| `subagents/` | `80_Archive/subagents/` | 이동. `ACTIVE/`, `COMPLETED/` 하위 디렉토리 보존 |

**원칙**: 기존 데이터 삭제 없음. 이동만 수행. 이동 후 원본 위치에 `_MOVED_TO.md` 리다이렉트 노트 생성.

---

## Event Types 추가 계획 (신규 추가)

Batch 0에서 `packages/protocol/src/event.ts` `EVENT_TYPES`에 추가할 이벤트:

```typescript
// Thread/Comms events
"thread.created"
"thread.message_appended"
"thread.closed"
"thread.summary_updated"
"thread.decision_recorded"

// Agent Registry events
"agent.created"
"agent.patch_proposed"
"agent.patch_approved"
"agent.patch_applied"
"agent.archived"

// Improver events
"improver.pattern_mined"
"improver.patch_generated"
"improver.report_generated"

// Background events
"background.session_started"
"background.session_stopped"
"background.log_ingested"
```

**Reducer 추가** (`packages/protocol/src/ownership.ts`):

| Reducer | 소유 파일 | 소비 이벤트 |
|---|---|---|
| `ThreadReducer` | `.notes/40_Comms/**/*.md` | `thread.*` |
| `AgentRegistryReducer` | `.notes/10_Agents/**/*.md` | `agent.*` |
| `ImproverReducer` | `.notes/70_Reviews/**/*.md` | `improver.*` |
| `BackgroundReducer` | `.notes/30_Runs/**/bg-*.md` | `background.*` |

**paths.ts classifyPath() 추가** (coding rule 2):

```
.notes/00_Inbox/**    → INBOX_PLANE
.notes/10_Agents/**   → AGENT_PLANE
.notes/20_Workspaces/** → WORKSPACE_PLANE
.notes/30_Runs/**     → RUN_PLANE
.notes/40_Comms/**    → COMMS_PLANE
.notes/50_Decisions/** → DECISION_PLANE
.notes/60_Memory/**   → MEMORY_PLANE
.notes/70_Reviews/**  → REVIEW_PLANE
.notes/80_Archive/**  → ARCHIVE_PLANE
.notes/.index/**      → INDEX_PLANE (machine-only)
```

---

## Python Event Type Validation (신규 추가)

`ensemble_events.py` `append_event()`에 검증 추가:

```python
# scripts/ensemble_allowed_events.py (build step에서 event.ts로부터 생성)
ALLOWED_EVENT_TYPES = frozenset([
    "thread.created", "thread.message_appended", ...
])

# ensemble_events.py append_event() 수정
def append_event(event_type: str, payload: dict, ...):
    from ensemble_allowed_events import ALLOWED_EVENT_TYPES
    if event_type not in ALLOWED_EVENT_TYPES:
        raise ValueError(f"Unknown event type: {event_type}")
    ...
```

**CI 검증**: `pnpm build` 시 `event.ts` → `ensemble_allowed_events.py` 동기화 스크립트 실행. 불일치 시 CI fail.

---

## Forward Bridge API Contracts (신규 추가)

### Threads API (Batch 2)

```
GET /api/threads
  Query: ?workspace=&agent=&status=open|closed&limit=50&offset=0
  Response: { threads: ThreadSummary[], total: number }
  ThreadSummary: { id, kind, workspace, run, status, participants, created_at, updated_at, summary_l0 }

GET /api/threads/:id
  Response: { thread: ThreadFull }
  ThreadFull: ThreadSummary + { messages: Message[], decisions: Decision[], evidence_refs: string[] }

GET /api/threads/search
  Query: ?q=keyword&limit=20
  Response: { results: SearchResult[], total: number }
  SearchResult: { thread_id, snippet, score, matched_at }
```

### Agents API (Batch 1 + Batch 5)

```
GET /api/agents
  Response: { agents: AgentSummary[] }
  AgentSummary: { id, role, status, public_persona, skills_count, last_active_at }

GET /api/agents/:id
  Response: { agent: AgentFull }
  AgentFull: AgentSummary + { private_policy, skills, memory_namespace, hermes_profile, pending_patches: Patch[] }

GET /api/agents/:id/patches
  Response: { patches: Patch[] }
  Patch: { id, type, rationale, status, created_at, diff_summary }
```

### Approvals API (Batch 5)

```
GET /api/approvals
  Query: ?status=pending|approved|rejected&limit=20
  Response: { approvals: Approval[] }
  Approval: { id, type, target_agent, description, status, created_at, evidence_refs }

POST /api/approvals/:id/approve
POST /api/approvals/:id/reject
  Body: { reason: string }
```

**Python handler 위치**: `scripts/ensemble_forward_bridge.py` 에 `ThreadHandler`, `AgentHandler`, `ApprovalHandler` 클래스 추가.

---

## Implementation Plan: 6 Batches

### Batch 0 — Decision Documentation + Event Foundation (5-7 days, time-boxed 7일)

**Goal**: 정본과 우선순위를 명문화하고, event-first 기반을 구축한다.

**Rollback**: ADR/schema/event types는 독립 커밋. 실패 시 개별 revert.

#### Task 0.1: ADR-0002 작성
- **File**: `docs/adr-0002-product-surface-persistent-agents.md`
- **Content**: `.notes` = Obsidian Vault (projection from events), `.agent` = canonical agent config, `.conitens/personas` = compat/import, office metaphor freeze, `.notes/` migration mapping (위 표 포함)
- **TDD**: ADR frontmatter schema test + migration mapping completeness test
- **Acceptance**: ADR merged, 12개 기존 디렉토리 매핑 문서화

#### Task 0.2: Event types + Reducers + Paths 등록
- **Files**:
  - `packages/protocol/src/event.ts` — 16개 신규 event types 추가 + `OBSOLETE_ALIASES`에 legacy SCREAMING_CASE 매핑 추가 (`ROOM_CREATED` → 적절한 dot.notation, `MEMORY_APPENDED` → `memory.update_proposed` 등)
  - `packages/protocol/src/ownership.ts` — 4개 Reducer 추가 (Thread, AgentRegistry, Improver, Background)
  - `packages/protocol/src/paths.ts` — `.notes/` 경로 분류 추가. **구현 결정 필요**: 기존 `PLANES` 타입 확장 vs 별도 `NotesPathClass` 타입 생성. `classifyPath()` 소비자 blast radius 확인 후 결정.
- **Semantic note**: 신규 `agent.created`/`agent.archived`는 registry lifecycle 이벤트. 기존 `agent.spawned`/`agent.terminated`는 runtime lifecycle 이벤트. `event.ts`에 주석으로 구분 문서화.
- **TDD**: exhaustiveness test (모든 event type이 최소 1개 reducer에 매핑), classifyPath() 신규 경로 테스트, legacy alias 해석 테스트
- **Acceptance**: `pnpm test` 통과, 신규 event/reducer/path 등록 확인, `ROOM_CREATED` alias 해석 확인

#### Task 0.3: Python event type validation 동기화
- **Files**:
  - `scripts/sync_event_types.py` — `event.ts` → `ensemble_allowed_events.py` 생성
  - `scripts/ensemble_allowed_events.py` — 생성됨
  - `scripts/ensemble_events.py` — `append_event()`에 validation 추가
- **TDD**: `sync_event_types.py` 출력 검증, 미등록 event type 발행 시 ValueError test
- **Acceptance**: `python scripts/sync_event_types.py && python -m pytest tests/test_event_validation.py` pass

#### Task 0.4: Communication/Agent/Memory note schema 정의
- **Files**:
  - `packages/protocol/src/schemas/thread-note.schema.ts`
  - `packages/protocol/src/schemas/agent-card.schema.ts`
  - `packages/protocol/src/schemas/decision-note.schema.ts`
  - `packages/protocol/src/schemas/memory-note.schema.ts`
- **Example frontmatter fixtures** (each schema에 1개):

```yaml
# thread-note fixture
id: thread-user-auth-migration-001
kind: user_agent  # enum: user_agent | agent_agent | agent_agent_user
workspace: ws-auth-migration
run: run-2026-04-06-001
participants: [user, supervisor-core]
status: open  # enum: open | closed | archived
visibility: internal
created_at: "2026-04-06T09:10:00Z"
updated_at: "2026-04-06T09:18:12Z"
tags: [thread, user-agent, auth-migration]
prompt_tokens_est: 480
compression_ratio: 0.18
```

```yaml
# agent-card fixture
id: supervisor-core
role: supervisor  # enum: supervisor | recorder | improver | worker
public_persona: "Concise orchestration lead"
status: active  # enum: active | archived | draft
skills: [supervisor-routing, approval-gate]
memory_namespace: conitens/main/supervisor-core
hermes_profile: cns::ws-core::supervisor-core
```

- **TDD**: Zod schema validation with valid/invalid fixtures, JSON Schema export test
- **JSON Schema export**: Zod → JSON Schema 변환 (`zod-to-json-schema`), Python에서 `jsonschema` 라이브러리로 검증 가능
- **Dependency**: `pnpm add -D zod-to-json-schema` (현재 미설치 — 이 Task에서 추가). Zod refinement는 JSON Schema로 표현 불가하므로 schema 설계 시 `.refine()` 대신 기본 타입 제약 사용.
- **Acceptance**: 4개 schema + 4개 fixture + JSON Schema 파일 생성

#### Task 0.5: `.notes/` Obsidian Vault 디렉토리 구조 생성 + 마이그레이션
- **Directories**: `00_Inbox/` ~ `80_Archive/` + `.index/`
- **Migration**: 위 매핑 표에 따라 기존 12개 디렉토리 이동, `_MOVED_TO.md` 리다이렉트 생성
- **TDD**: 디렉토리 존재 + 리다이렉트 노트 존재 + 기존 파일 보존 test
- **Acceptance**: Obsidian에서 `.notes/` 열었을 때 numbered 구조 확인, 기존 데이터 접근 가능

#### Task 0.6: README / AGENTS.md / CONITENS.md 정합화
- **Content**: "persistent agent/records 우선, office 후순위", event-first, `.notes/` = projection
- **TDD**: 문서 내 키워드 일관성 grep test (금지어: "office 우선", 필수어: "event-first")
- **Acceptance**: 문서 간 모순 제거

#### Batch 0 Completion Criteria
- [ ] ADR-0002 merged (migration mapping 포함)
- [ ] 16개 event types + 4개 reducers + 9개 paths 등록, `pnpm test` pass
- [ ] Python event type validation 동작, 미등록 type 거부
- [ ] 4개 note schema + JSON Schema export 완료
- [ ] `.notes/` Obsidian 구조 생성 + 마이그레이션 완료
- [ ] 문서 정합 완료

---

### Batch 1 — Persistent Agent MVE (1.5 weeks)

**Goal**: 영구 에이전트를 CLI로 생성/수정/조회할 수 있게 한다.

**Rollback**: `.agent/agents/` 신규 YAML + `.notes/10_Agents/` 신규 MD를 revert.

#### Task 1.1: `ensemble_agent_registry.py` 구현 (event-first)
- **File**: `scripts/ensemble_agent_registry.py`
- **Architecture**: 모든 mutation은 `append_event("agent.created", ...)` → `ensemble_obsidian.py`가 projection
- **Functions**:
  - `agent_create(...)` → emit `agent.created` event → projection: `.agent/agents/{id}.yaml` + `.notes/10_Agents/{id}.md`
  - `agent_patch(...)` → emit `agent.patch_proposed` → `.conitens/personas/candidate_patches/{id}-{date}.md`
  - `agent_review_patches(id)` → read patches list
  - `agent_apply_patch(patch_id)` → emit `agent.patch_approved` + `agent.patch_applied`
  - `agent_archive(id)` → emit `agent.archived`
  - `agent_list()` → read `.agent/agents/`
- **TDD**: Full lifecycle test (create → list → patch → review → apply → archive), event emission verification
- **Acceptance**: `ensemble agent create/list/patch/apply/archive` CLI

#### Task 1.2: Supervisor / Recorder / Improver 기본 3종 생성
- **Files**: `.agent/agents/{supervisor,recorder,improver}-core.yaml` + `.notes/10_Agents/{supervisor,recorder,improver}-core.md`
- **Agent manifest fields**: id, role, public_persona, private_policy, skills, memory_namespace, hermes_profile, handoff_required_fields, obsidian_note, status
- **TDD**: Manifest schema validation (JSON Schema from Task 0.4), Obsidian frontmatter valid
- **Acceptance**: 3종 agent CLI 조회 가능, Obsidian에서 열림 (frontmatter 파싱 + wikilink 동작 확인: `python scripts/ensemble_obsidian.py validate .notes/10_Agents/supervisor-core.md`)

#### Task 1.3: Forward Bridge `/api/agents` 엔드포인트
- **File**: `scripts/ensemble_forward_bridge.py` — `AgentHandler` 추가
- **Endpoints**: `GET /api/agents`, `GET /api/agents/:id`, `GET /api/agents/:id/patches`
- **TDD**: HTTP response schema test against Zod-generated JSON Schema
- **Acceptance**: `curl localhost:PORT/api/agents` → JSON 응답

#### Task 1.4: Hermes profile mapping stub
- **File**: `scripts/ensemble_hermes.py` (stub)
- **Function**: `create_hermes_profile(agent_id, workspace)` → profile name
- **Note**: Hermes 실 연동은 Batch 4. 이 단계는 naming convention과 manifest 기록만.
- **TDD**: Profile name format test (`cns::{workspace}::{agent}`)
- **Acceptance**: Agent 생성 시 hermes_profile 필드 자동 기록

#### Batch 1 Completion Criteria
- [ ] CLI `ensemble agent create/list/patch/apply/archive` 동작
- [ ] 3축 agent 생성됨, event log에 `agent.created` 기록됨
- [ ] Agent card가 Obsidian에서 열림 (`ensemble_obsidian.py validate` pass)
- [ ] `/api/agents` Bridge 엔드포인트 응답
- [ ] Patch review → apply 워크플로 검증 (event trail 확인)

---

### Batch 2 — Communication Ledger + Thread Browser (1.5 weeks)

**Goal**: 모든 소통을 기록·검색·열람 가능하게 한다.

**Rollback**: `ensemble_comms.py` + `.notes/40_Comms/` projection 파일 revert. Event log 보존 (append-only).

#### Task 2.1: `ensemble_comms.py` 구현 (event-first)
- **File**: `scripts/ensemble_comms.py`
- **Architecture**: 모든 write는 event 발행. `.notes/40_Comms/` 파일은 projection layer가 생성.
  - `thread_create(kind, workspace, run, participants)` → emit `thread.created` event
  - `thread_append(thread_id, sender, message)` → emit `thread.message_appended` event
  - `thread_close(thread_id, summary)` → emit `thread.closed` event
  - `decision_create(thread_id, decision, rationale, evidence_refs)` → emit `thread.decision_recorded`
  - `thread_list(...)` / `thread_show(...)` / `thread_search(...)` → read from projection + index
  - `thread_export(thread_id, format="md")` → read projection
  - `daily_digest_generate(date)` → read events, generate digest
- **Thread kind enum**: `user_agent`, `agent_agent`, `agent_agent_user` (Task 0.4 schema에서 정의)
- **TDD**: Thread lifecycle test, event emission test, projection 재생성 test (events만으로 `.notes/40_Comms/` 재구축)
- **Acceptance**: `ensemble comms list/show/search/export` CLI, event log에 `thread.*` 기록

#### Task 2.2: `ensemble_obsidian.py` projection layer
- **File**: `scripts/ensemble_obsidian.py`
- **Architecture**: **단일 writer** — 이 모듈만 `.notes/40_Comms/`, `.notes/10_Agents/`, `.notes/70_Reviews/` 에 쓰기 허용 (I-7 준수)
- **Projection timing**: **Synchronous** — CLI 명령 내에서 event emit 직후 inline으로 projection 실행. CLI가 반환하기 전에 `.notes/` 파일이 생성되어야 read-after-write 일관성 보장. `rebuild_all()`은 검증/복구용이며 정상 운영 시에는 사용하지 않음.
- **Functions**:
  - `project_thread(event_stream)` → `.notes/40_Comms/YYYY/MM/DD/thread-{slug}.md`
  - `project_agent_card(event_stream)` → `.notes/10_Agents/{id}.md`
  - `project_decision(event_stream)` → `.notes/50_Decisions/{slug}.md`
  - `project_daily_digest(date, events)` → `.notes/00_Inbox/{date}-digest.md`
  - `rebuild_all(events_dir)` → 전체 projection 재생성 (I-2 검증)
  - `validate_note(path)` → frontmatter, wikilinks, tags 검증
- **TDD**: Projection output validation, `rebuild_all()` idempotency test, I-7 ownership test (다른 모듈이 쓰면 fail)
- **Acceptance**: `python scripts/ensemble_obsidian.py rebuild` 후 `.notes/` 가 event log만으로 재생성됨

#### Task 2.3: Thread search index (SQLite FTS)
- **File**: `.notes/.index/comms.sqlite3`
- **Rebuild strategy**: `ensemble_obsidian.py rebuild` 시 index도 재생성 (event-first, I-2 준수)
- **TDD**: Index build → search → ranking test, index 삭제 후 rebuild test
- **Acceptance**: `ensemble comms search "keyword"` < 500ms

#### Task 2.4: Forward Bridge `/api/threads` 엔드포인트
- **File**: `scripts/ensemble_forward_bridge.py` — `ThreadHandler` 추가
- **Endpoints**: `GET /api/threads`, `GET /api/threads/:id`, `GET /api/threads/search`
- **Response schemas**: 위 API Contracts 섹션 참조
- **TDD**: HTTP response schema test
- **Acceptance**: `curl localhost:PORT/api/threads` → JSON 응답

#### Task 2.5: Dashboard `threads` / `thread-detail` 화면
- **Files**:
  - `packages/dashboard/src/components/ThreadBrowser.tsx`
  - `packages/dashboard/src/components/ThreadDetail.tsx`
  - `packages/dashboard/src/forward-route.ts` — `"threads" | "thread-detail"` 추가
- **Data source**: `/api/threads`, `/api/threads/:id`
- **TDD**: Component render test (mock API response from schema fixtures), route parsing test
- **Acceptance**: Dashboard에서 thread 목록 + 상세 열람 가능

#### Batch 2 Completion Criteria
- [ ] 3종 thread (user_agent, agent_agent, agent_agent_user) 기록 가능
- [ ] Event log에 `thread.*` 이벤트 기록, `.notes/40_Comms/`에 projection 생성
- [ ] `ensemble_obsidian.py rebuild` → events만으로 projection 재생성 (I-2 검증)
- [ ] CLI `ensemble comms list/show/search/tail/export` 동작
- [ ] Forward Bridge `/api/threads` 응답
- [ ] Dashboard threads + thread-detail 화면 동작
- [ ] SQLite FTS 검색 동작, index rebuild 가능

---

### Batch 3 — Background CLI Runtime (1 week)

**Goal**: GUI 없이 detach/attach 가능한 background runtime.

**Rollback**: `ensemble_background.py` 삭제 + 관련 event types는 보존.

**Primary platform**: Windows (개발 머신). tmux는 Linux/macOS secondary.

#### Task 3.1: `ensemble_background.py` 구현
- **File**: `scripts/ensemble_background.py`
- **Architecture**: session lifecycle → event 발행 (`background.*`)
- **Adapter pattern**: `BackgroundAdapter` ABC → `SubprocessAdapter` (Windows primary), `TmuxAdapter` (Linux/macOS)
- **Functions**:
  - `bg_up(workspace, agents=None)` → emit `background.session_started`, create session
  - `bg_ps()` → list active sessions
  - `bg_attach(workspace, agent)` → attach to session
  - `bg_logs(workspace, agent, tail=100)` → read stdout/stderr
  - `bg_stop(workspace, agent)` → graceful stop, emit `background.session_stopped`
  - `bg_kill(workspace, all=False)` → force kill
- **Session naming**: `cns::{workspace}::{agent}`
- **TDD**: Session lifecycle test (up → ps → logs → stop), adapter interface conformance test
- **Acceptance**: `ensemble bg up/ps/logs/stop` on Windows

#### Task 3.2: Session logs → Recorder projection
- **Integration**: `bg_logs` → emit `background.log_ingested` → `ensemble_obsidian.py` projects to thread note
- **TDD**: Raw log → event → thread note projection test
- **Acceptance**: Background worker 로그가 `.notes/40_Comms/`에 thread로 반영

#### Batch 3 Completion Criteria
- [ ] Windows에서 bg up/ps/logs/stop 동작 (SubprocessAdapter)
- [ ] Session log → event → thread note projection 체인 동작
- [ ] Office UI 없이 background 운영 가능
- [ ] Event log에 `background.*` 이벤트 기록

---

### Batch 4 — Token Optimization + OpenViking Pilot (1 week)

**Goal**: 소통·기억 비용을 줄인다.

**Rollback**: `ensemble_token_budget.py` 삭제. Compression policy는 projection layer 설정이므로 rollback 간단.

#### Task 4.1: `ensemble_token_budget.py` 구현
- **File**: `scripts/ensemble_token_budget.py`
- **Functions**:
  - `compress_to_l0(thread)` → Signal Card (1-3문장)
  - `compress_to_l1(thread)` → Thread Summary (5-15 bullets, ≤400 tokens)
  - `estimate_tokens(text)` → 토큰 수 추정 (tiktoken 또는 word-count heuristic)
  - `validate_budget(artifact_type, text)` → budget 초과 여부
  - `generate_workspace_brief(workspace)` → ≤800 tokens
  - `generate_handoff_packet(thread, decisions)` → ≤250 tokens
- **Budget limits**: AGENTS.md ≤4000 chars, workspace brief ≤800 tokens, thread summary ≤400 tokens, handoff ≤250 tokens, approval request ≤150 tokens, daily digest ≤600 tokens
- **TDD**: Compression ratio test, budget validation pass/fail test, token estimation accuracy test
- **Acceptance**: `python scripts/ensemble_token_budget.py validate --file <path>` → PASS/FAIL with token count

#### Task 4.2: Thread summary auto-refresh (emit `thread.summary_updated`)
- **Integration**: N개+ 메시지 추가 시 L1 재생성, event 발행
- **I-2 idempotency 보장**: `thread.summary_updated` event payload에 **계산된 L0/L1 텍스트를 포함**해야 함. Projection layer는 event payload의 summary를 그대로 사용. `rebuild_all()` 시 요약을 재계산하지 않고 event에서 읽음. 이렇게 해야 rebuild가 deterministic.
- **TDD**: Staleness detection + refresh + event emission test + rebuild idempotency test (rebuild 전후 동일 output)
- **Acceptance**: Thread note frontmatter에 `prompt_tokens_est`, `compression_ratio` 기록, `rebuild_all()` 후 summary 동일

#### Task 4.3: Hermes OpenViking provider pilot (interface only)
- **File**: `scripts/ensemble_hermes.py` 확장
- **Note**: OpenViking은 AGPL-3.0. **법적 검토 필수** (Batch 4 시작 전 완료).
- **Function stubs**: `openviking_store(summary)`, `openviking_search(query)`
- **TDD**: Interface contract test (stub이므로 NotImplementedError 확인)
- **Acceptance**: Interface 존재, 실 연동은 법적 검토 완료 후

#### Batch 4 Completion Criteria
- [ ] Handoff packet ≤250 tokens (측정 가능)
- [ ] Full transcript prompt 주입 제거
- [ ] L1-first retrieval 정책 projection layer에 적용
- [ ] Token telemetry frontmatter 기록
- [ ] OpenViking interface 정의 (실 연동은 법적 검토 후)

---

### Batch 5 — Improver Loop + Agent/Approval UI (1 week)

**Goal**: 재귀개선 축을 굴리고, dashboard Agent Studio/Approval Center를 추가한다.

**Rollback**: `ensemble_improver.py` + dashboard 신규 컴포넌트 revert.

#### Task 5.1: `ensemble_improver.py` 구현 (event-first)
- **File**: `scripts/ensemble_improver.py`
- **Architecture**: 분석 결과 → event 발행 (`improver.*`) → projection
- **Functions**:
  - `mine_failure_patterns(since_date)` → emit `improver.pattern_mined`
  - `generate_persona_patch(agent_id, findings)` → emit `improver.patch_generated` → candidate patch
  - `generate_skill_patch(skill_id, findings)` → emit `improver.patch_generated`
  - `generate_workflow_patch(workflow_id, findings)` → emit `improver.patch_generated`
  - `generate_token_waste_report(since_date)` → emit `improver.report_generated`
  - `generate_weekly_report()` → 종합 리포트 → `.notes/70_Reviews/`
- **TDD**: Failure pattern extraction test, patch generation test, report format test, event emission test
- **Acceptance**: `ensemble improver report/mine/patch` CLI

#### Task 5.2: Forward Bridge `/api/approvals` 엔드포인트
- **File**: `scripts/ensemble_forward_bridge.py` — `ApprovalHandler` 추가
- **Endpoints**: `GET /api/approvals`, `POST /api/approvals/:id/approve`, `POST /api/approvals/:id/reject`
- **TDD**: HTTP response schema test
- **Acceptance**: Bridge 응답 확인

#### Task 5.3: Dashboard Agents + Approvals 화면
- **Files**:
  - `packages/dashboard/src/components/AgentStudio.tsx`
  - `packages/dashboard/src/components/AgentDetail.tsx`
  - `packages/dashboard/src/components/ApprovalCenter.tsx`
  - `packages/dashboard/src/forward-route.ts` — `"agents" | "agent-detail" | "approvals"` 추가
- **Data source**: `/api/agents`, `/api/agents/:id`, `/api/approvals`
- **TDD**: Component render test (mock data from schema fixtures), route parsing test
- **Acceptance**: Dashboard Agent 목록/상세 + Approval 목록 확인

#### Batch 5 Completion Criteria
- [ ] 주간 개선 리포트 생성 (`.notes/70_Reviews/`)
- [ ] 개선안은 candidate patch로만 (`improver.patch_generated` event)
- [ ] 승인 후에만 적용 (`agent.patch_approved` → `agent.patch_applied`)
- [ ] Dashboard Agent Studio + Approval Center 동작
- [ ] Forward Bridge `/api/approvals` 응답

---

## Cross-Cutting Concerns

### Testing Strategy
- **Unit**: 각 `ensemble_*.py` 핵심 함수 (pytest, `pytest-cov` ≥80%)
- **Integration**: CLI command → event emission → projection → schema validation 체인
- **E2E**: Agent lifecycle (create → work → record → improve → patch) 전체 흐름
- **I-2 검증**: `ensemble_obsidian.py rebuild` → events만으로 `.notes/` 완전 재생성
- **Coverage**: `pytest --cov=scripts --cov-report=term-missing` ≥80%

### Migration Safety
- 기존 `.agent/agents/` 5개 YAML 보존
- 기존 `.notes/` 파일은 numbered 구조로 이동 (삭제 없음)
- `ensemble.py` core 무수정 — additive extension only
- Event log append-only — rollback 시에도 event 삭제 안함

### Per-Batch Rollback Plan
| Batch | Rollback 방법 |
|-------|-------------|
| 0 | Git revert ADR/schema/event commits. `.notes/` 이동은 역방향 스크립트로 복원 |
| 1 | `.agent/agents/` 신규 YAML + `.notes/10_Agents/` projection 삭제. Events 보존 |
| 2 | `ensemble_comms.py` + `.notes/40_Comms/` projection 삭제. SQLite index 삭제. Events 보존 |
| 3 | `ensemble_background.py` 삭제. Sessions은 OS-level cleanup |
| 4 | `ensemble_token_budget.py` 삭제. Compression config revert |
| 5 | `ensemble_improver.py` + dashboard 신규 컴포넌트 revert |

### Verification Commands
```bash
# Batch 0
pnpm test && python scripts/sync_event_types.py && python -m pytest tests/test_event_validation.py
# Batch 1
ensemble agent list && ensemble agent create test-agent --role worker --provider claude-code
curl localhost:PORT/api/agents | python -m json.tool
# Batch 2
ensemble comms list && ensemble comms search "test"
python scripts/ensemble_obsidian.py rebuild && python scripts/ensemble_obsidian.py validate .notes/40_Comms/
curl localhost:PORT/api/threads | python -m json.tool
# Batch 3
ensemble bg up test-ws && ensemble bg ps && ensemble bg logs test-ws worker && ensemble bg stop test-ws
# Batch 4
python scripts/ensemble_token_budget.py validate --file .notes/40_Comms/sample-thread.md
# Batch 5
ensemble improver report --since 2026-04-01
curl localhost:PORT/api/approvals | python -m json.tool
```

---

## ADR (Architectural Decision Record)

**Decision**: Option A — Event-first 6-Batch 순차 실행 + Batch 0 확장 (+3일)
**Drivers**: I-1/I-2 불변식 준수, 기존 runtime truth 활용, 점진적 가치 전달
**Alternatives Considered**:
- B (Batch 0+1 병합): event types 미확정 시 50%+ schema rework 확률
- C (UI-first): Bridge API 없이 불가
**Why Chosen**: Event-first로 모든 `.notes/` 파일이 event replay에서 재생성 가능. 각 Batch 독립 rollback. Core 무수정.
**Consequences**: 6주+3일 소요. Batch 간 순차 의존. 그러나 I-1/I-2 완전 준수.
**Follow-ups**:
- OpenViking AGPL-3.0 법적 검토 (Batch 4 전)
- Hermes 실 연동 검증 (Batch 4)
- Python scripts 패키지 구조 전환 검토 (6 Batch 완료 후 별도 ADR)
