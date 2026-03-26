# Multi-Agent Workspace Architecture v5.3.0

> Reference architecture artifact imported from `claude/multi-agent-workspace-planning-VWmjL`.
>
> Current active product-line truth in this repository remains the Python
> `ensemble` control plane plus `.notes/` and `.agent/`. Treat this document as
> planning/reference input, not current runtime semantics.

> Ensemble Multi-Agent Workspace의 전체 아키텍처 및 기능 작동 방식

---

## 🏗️ 전체 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        MULTI-AGENT WORKSPACE v5.3.0                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│  │   GEMINI    │    │   CLAUDE    │    │   CLAUDE    │    │   CODEX     │       │
│  │  Planner    │    │  Terminal 1 │    │  Terminal 2 │    │  Reviewer   │       │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘       │
│         │                  │                  │                  │              │
│         └──────────────────┼──────────────────┼──────────────────┘              │
│                            │                  │                                  │
│                            ▼                  ▼                                  │
│              ┌─────────────────────────────────────────┐                        │
│              │        ENSEMBLE CLIENT SDK              │                        │
│              │   (ensemble_client.py)                  │                        │
│              │   • WebSocket Connection                │                        │
│              │   • Event Handling                      │                        │
│              │   • Lock Management                     │                        │
│              └─────────────────┬───────────────────────┘                        │
│                                │                                                 │
│                                ▼                                                 │
│              ┌─────────────────────────────────────────┐                        │
│              │      CONTEXT SYNC SERVER                │                        │
│              │   (ensemble_server.py:9999)             │                        │
│              │                                         │                        │
│              │   ┌───────────┐  ┌───────────┐         │                        │
│              │   │  Agent    │  │   Lock    │         │                        │
│              │   │ Registry  │  │  Manager  │         │                        │
│              │   └───────────┘  └───────────┘         │                        │
│              │   ┌───────────┐  ┌───────────┐         │                        │
│              │   │   File    │  │  Event    │         │                        │
│              │   │  Watcher  │  │  Router   │         │                        │
│              │   └───────────┘  └───────────┘         │                        │
│              └─────────────────┬───────────────────────┘                        │
│                                │                                                 │
│         ┌──────────────────────┼──────────────────────┐                         │
│         ▼                      ▼                      ▼                         │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐                   │
│  │  PARTITION  │       │ ORCHESTRATOR│       │  ANALYTICS  │                   │
│  │   MANAGER   │       │     AI      │       │   ENGINE    │                   │
│  └─────────────┘       └─────────────┘       └─────────────┘                   │
│                                                                                  │
│                        ┌─────────────┐                                          │
│                        │  WORKSPACE  │                                          │
│                        │   FILES     │                                          │
│                        └─────────────┘                                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Phase별 구현 모듈

### Phase 1: Foundation (v5.0.0)

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: FOUNDATION                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ensemble_server.py              ensemble_client.py              │
│  ┌─────────────────┐            ┌─────────────────┐             │
│  │ Context Sync    │◄──────────►│ Agent Client    │             │
│  │ Server          │  WebSocket │ SDK             │             │
│  │                 │            │                 │             │
│  │ • Agent Registry│            │ • connect()     │             │
│  │ • Lock Manager  │            │ • acquire_lock()│             │
│  │ • File Watcher  │            │ • subscribe()   │             │
│  │ • Event Router  │            │ • broadcast()   │             │
│  └─────────────────┘            └─────────────────┘             │
│                                                                  │
│  Commands:                                                       │
│    ensemble server start --port 9999                             │
│    ensemble connect --agent CLAUDE --instance term-1             │
│    ensemble dashboard                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: Multi-Instance (v5.1.0)

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: MULTI-INSTANCE                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ensemble_partition.py           ensemble_dashboard.py           │
│  ┌─────────────────┐            ┌─────────────────┐             │
│  │ Partition       │            │ Web Dashboard   │             │
│  │ Manager         │            │                 │             │
│  │                 │            │ ┌─────────────┐ │             │
│  │ • recommend()   │            │ │  Agents     │ │             │
│  │ • create()      │            │ ├─────────────┤ │             │
│  │ • assign()      │            │ │  Locks      │ │             │
│  │ • load_balance()│            │ ├─────────────┤ │             │
│  └─────────────────┘            │ │  Events     │ │             │
│                                 │ └─────────────┘ │             │
│  Partition Example:             └─────────────────┘             │
│  ┌──────────────────────────────────────────────┐               │
│  │  src/                                         │               │
│  │  ├── frontend/  ← CLAUDE-1 (Partition A)     │               │
│  │  ├── backend/   ← CLAUDE-2 (Partition B)     │               │
│  │  └── shared/    ← (Shared, lock required)    │               │
│  └──────────────────────────────────────────────┘               │
│                                                                  │
│  Commands:                                                       │
│    ensemble partition recommend                                  │
│    ensemble partition assign --partition src/frontend --agent C1 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 3: Heterogeneous (v5.2.0)

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: HETEROGENEOUS MULTI-MODEL                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ensemble_orchestrator.py                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    GCC-RT MODE                           │    │
│  │                                                          │    │
│  │   ┌─────────┐      ┌─────────┐      ┌─────────┐        │    │
│  │   │ GEMINI  │ ───► │ CLAUDE  │ ───► │ CODEX   │        │    │
│  │   │ PLANNER │      │ IMPLEMENT│      │ REVIEW  │        │    │
│  │   └─────────┘      └─────────┘      └─────────┘        │    │
│  │        │                │                │              │    │
│  │        ▼                ▼                ▼              │    │
│  │   ┌─────────────────────────────────────────────┐      │    │
│  │   │              MERGE ENGINE                    │      │    │
│  │   │  • 3-way merge                              │      │    │
│  │   │  • Conflict detection                       │      │    │
│  │   │  • Auto-resolution                          │      │    │
│  │   └─────────────────────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Role-based Event Routing:                                       │
│  ┌────────────────┬─────────────────────────────────┐           │
│  │ Event Type     │ Routed To                       │           │
│  ├────────────────┼─────────────────────────────────┤           │
│  │ plan:proposed  │ PLANNER (Gemini)                │           │
│  │ code:written   │ IMPLEMENTER (Claude)            │           │
│  │ review:request │ REVIEWER (Codex)                │           │
│  └────────────────┴─────────────────────────────────┘           │
│                                                                  │
│  Commands:                                                       │
│    ensemble orchestrate start --mode GCC-RT                      │
│    ensemble orchestrate conflicts                                │
│    ensemble orchestrate resolve --conflict C001 --use-a          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 4: Advanced Features (v5.3.0)

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: ADVANCED FEATURES                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  REGION-LEVEL LOCKING (ensemble_region_lock.py)         │    │
│  │                                                          │    │
│  │  src/api.py                                              │    │
│  │  ┌────────────────────────────────────────────────┐     │    │
│  │  │  1  class UserAPI:           ◄── 🔒 CLAUDE-1   │     │    │
│  │  │  2      def get_user():      ◄── 🔒 (inherited)│     │    │
│  │  │  3          ...                                │     │    │
│  │  │  10     def update_user():   ◄── 🔓 Available  │     │    │
│  │  │  20 class ProductAPI:        ◄── 🔒 CLAUDE-2   │     │    │
│  │  │  ...                                           │     │    │
│  │  └────────────────────────────────────────────────┘     │    │
│  │                                                          │    │
│  │  Lock Types: CLASS | METHOD | FUNCTION | LINE_RANGE     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  SMART PARTITIONING (ensemble_smart_partition.py)       │    │
│  │                                                          │    │
│  │  Dependency Graph:          Change Frequency:            │    │
│  │  ┌─────┐    ┌─────┐        ┌─────────────────────┐      │    │
│  │  │ api │───►│utils│        │ 🔥 api.py (hotspot) │      │    │
│  │  └──┬──┘    └──┬──┘        │ 📊 utils.py (stable)│      │    │
│  │     │          │           │ 🧊 config.py (cold) │      │    │
│  │     ▼          ▼           └─────────────────────┘      │    │
│  │  ┌─────┐    ┌─────┐                                     │    │
│  │  │ db  │◄───│config│        Strategies:                 │    │
│  │  └─────┘    └─────┘        • balanced (default)         │    │
│  │                            • coupling (low external)    │    │
│  │  Auto-clusters by          • hotspot (isolate changes)  │    │
│  │  coupling + frequency                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  ORCHESTRATION AI (ensemble_orchestration_ai.py)        │    │
│  │                                                          │    │
│  │  Work Distribution:                                      │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │ WORK-001: API 구현     ──► CLAUDE (coding: 0.9) │    │    │
│  │  │ WORK-002: 보안 검토    ──► CODEX (security: 0.95)│   │    │
│  │  │ WORK-003: 문서 작성    ──► GEMINI (docs: 0.85)  │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                                                          │    │
│  │  Bottleneck Detection:                                   │    │
│  │  ⚠️ Agent Overload: CLAUDE-1 at 95% capacity            │    │
│  │  ⚠️ Blocked Tasks: 3 tasks waiting on WORK-001          │    │
│  │  💡 Recommendation: Rebalance to CLAUDE-2               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  ANALYTICS (ensemble_analytics.py)                      │    │
│  │                                                          │    │
│  │  Team Performance (30 days):                             │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │ 🥇 CLAUDE    Score: 0.87  Tasks: 45  Lines: 3.2K│    │    │
│  │  │ 🥈 CODEX     Score: 0.82  Tasks: 32  Reviews: 28│    │    │
│  │  │ 🥉 GEMINI    Score: 0.78  Tasks: 18  Plans: 15  │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                                                          │    │
│  │  Team Recommendations:                                   │    │
│  │  • new_feature: GEMINI + CLAUDE + CODEX (efficiency 85%)│    │
│  │  • bug_fix: CLAUDE only (efficiency 92%)                │    │
│  │  • security_audit: CODEX + CLAUDE (efficiency 88%)      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Commands:                                                       │
│    ensemble region lock --file api.py --region "UserAPI"        │
│    ensemble smart-partition partition --strategy hotspot         │
│    ensemble ai bottleneck                                        │
│    ensemble analytics recommend new_feature                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 전체 워크플로우

### 1. 서버 시작 및 Agent 연결

```
┌────────────────────────────────────────────────────────────────┐
│  STEP 1: Initialize Workspace                                   │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Terminal 0 (Server):                                           │
│  $ ensemble server start --port 9999 --background               │
│  ✅ Context Sync Server started on ws://localhost:9999          │
│                                                                 │
│  Terminal 1 (Claude - Frontend):                                │
│  $ ensemble connect --agent CLAUDE --instance frontend          │
│  ✅ Connected as CLAUDE-frontend                                │
│                                                                 │
│  Terminal 2 (Claude - Backend):                                 │
│  $ ensemble connect --agent CLAUDE --instance backend           │
│  ✅ Connected as CLAUDE-backend                                 │
│                                                                 │
│  Terminal 3 (Codex - Reviewer):                                 │
│  $ ensemble connect --agent CODEX --instance reviewer           │
│  ✅ Connected as CODEX-reviewer                                 │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 2. 파티션 설정 및 작업 분배

```
┌────────────────────────────────────────────────────────────────┐
│  STEP 2: Setup Partitions & Distribute Work                     │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Smart Partition Analysis:                                      │
│  $ ensemble smart-partition partition --strategy balanced       │
│                                                                 │
│  📦 Partitions Created:                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ PART-001-frontend (8 files)                              │   │
│  │   Internal: 75%  External: 25%  Hotspot: 0.3            │   │
│  │                                                          │   │
│  │ PART-002-backend (12 files)                              │   │
│  │   Internal: 80%  External: 20%  Hotspot: 0.6            │   │
│  │                                                          │   │
│  │ PART-003-shared (5 files)                                │   │
│  │   Internal: 40%  External: 60%  Hotspot: 0.8            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Assign Agents:                                                 │
│  $ ensemble partition assign --partition frontend --agent C-FE  │
│  $ ensemble partition assign --partition backend --agent C-BE   │
│                                                                 │
│  AI Work Distribution:                                          │
│  $ ensemble ai work add --title "API 구현" --caps coding        │
│  $ ensemble ai work assign                                      │
│  ✅ WORK-001 assigned to CLAUDE-backend (score: 0.92)          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 3. 동시 작업 및 Region Lock

```
┌────────────────────────────────────────────────────────────────┐
│  STEP 3: Concurrent Work with Region Locking                    │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CLAUDE-frontend working on src/components/UserForm.tsx:        │
│  $ ensemble region lock --file UserForm.tsx --region "UserForm" │
│  ✅ Lock acquired: UserForm (lines 1-150)                       │
│                                                                 │
│  CLAUDE-backend working on src/api/user.py:                     │
│  $ ensemble region lock --file user.py --region "UserAPI"       │
│  ✅ Lock acquired: UserAPI (lines 10-85)                        │
│                                                                 │
│  CLAUDE-backend tries to lock shared file:                      │
│  $ ensemble region lock --file utils.py --region "validate"     │
│  ✅ Lock acquired: validate (lines 20-45)                       │
│                                                                 │
│  CLAUDE-frontend tries same region:                             │
│  $ ensemble region lock --file utils.py --region "validate"     │
│  ❌ Region locked by CLAUDE-backend                             │
│                                                                 │
│  Real-time Event Flow:                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [12:00:01] CLAUDE-BE: file:changed → src/api/user.py    │   │
│  │ [12:00:02] CLAUDE-FE: received file:changed event       │   │
│  │ [12:00:03] CODEX-REV: review:requested → user.py        │   │
│  │ [12:00:05] CODEX-REV: Starting code review...           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 4. 병목 감지 및 재분배

```
┌────────────────────────────────────────────────────────────────┐
│  STEP 4: Bottleneck Detection & Rebalancing                     │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  $ ensemble ai bottleneck                                       │
│                                                                 │
│  ⚠️ Detected Bottlenecks:                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🟠 [HIGH] agent_overload                                 │   │
│  │    CLAUDE-backend at 90% capacity                        │   │
│  │    💡 Consider adding more agents or redistributing      │   │
│  │                                                          │   │
│  │ 🟡 [MEDIUM] blocked_tasks                                │   │
│  │    2 tasks blocked by WORK-003                           │   │
│  │    💡 Prioritize completing WORK-003                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  $ ensemble ai rebalance                                        │
│                                                                 │
│  🔄 Rebalancing Actions:                                        │
│  • WORK-005: CLAUDE-backend → CLAUDE-frontend                   │
│  • WORK-007: CLAUDE-backend → CODEX-reviewer                    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 5. 분석 및 리포트

```
┌────────────────────────────────────────────────────────────────┐
│  STEP 5: Analytics & Reporting                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  $ ensemble analytics summary --days 7                          │
│                                                                 │
│  📊 Collaboration Summary (Last 7 days):                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Tasks: 24 total, 22 completed, 2 failed (91.7%)         │   │
│  │ Avg Completion: 2.3 hours                                │   │
│  │ Team Velocity: 3.1 tasks/day                             │   │
│  │ Code Throughput: 450 lines/day                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  $ ensemble analytics contributors                              │
│                                                                 │
│  👥 Agent Contributions:                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🥇 CLAUDE-backend                                        │   │
│  │    Score: 0.89 | Tasks: 12 | Lines: 1,850 | Commits: 18 │   │
│  │                                                          │   │
│  │ 🥈 CLAUDE-frontend                                       │   │
│  │    Score: 0.84 | Tasks: 8 | Lines: 1,200 | Commits: 12  │   │
│  │                                                          │   │
│  │ 🥉 CODEX-reviewer                                        │   │
│  │    Score: 0.81 | Reviews: 15 | Bugs Found: 7            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  $ ensemble analytics recommend new_feature --size large        │
│                                                                 │
│  🎯 Team Recommendation:                                        │
│  • GEMINI (planning) - Expected: 0.78                           │
│  • CLAUDE-backend (coding) - Expected: 0.89                     │
│  • CLAUDE-frontend (coding) - Expected: 0.84                    │
│  • CODEX-reviewer (review) - Expected: 0.81                     │
│  Expected Efficiency: 87%                                       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 📋 CLI 명령어 요약

### Phase 1-2: 기본 Multi-Agent

| 명령어 | 설명 |
|--------|------|
| `ensemble server start` | Context Sync 서버 시작 |
| `ensemble server status` | 서버 상태 확인 |
| `ensemble connect --agent X --instance Y` | Agent 연결 |
| `ensemble dashboard` | 웹 대시보드 실행 |
| `ensemble partition recommend` | 파티션 추천 |
| `ensemble partition assign` | Agent에 파티션 할당 |

### Phase 3: Heterogeneous

| 명령어 | 설명 |
|--------|------|
| `ensemble orchestrate start --mode GCC-RT` | 오케스트레이터 시작 |
| `ensemble orchestrate status` | 상태 확인 |
| `ensemble orchestrate conflicts` | 충돌 목록 |
| `ensemble orchestrate resolve` | 충돌 해결 |

### Phase 4: Advanced

| 명령어 | 설명 |
|--------|------|
| `ensemble region parse <file>` | 파일의 잠금 가능 영역 표시 |
| `ensemble region lock` | 영역 잠금 |
| `ensemble region unlock` | 잠금 해제 |
| `ensemble region status` | 활성 잠금 표시 |
| `ensemble smart-partition analyze` | 의존성 분석 |
| `ensemble smart-partition partition` | 스마트 파티션 생성 |
| `ensemble ai status` | AI 오케스트레이션 상태 |
| `ensemble ai agent register` | Agent 등록 |
| `ensemble ai work add` | 작업 추가 |
| `ensemble ai bottleneck` | 병목 감지 |
| `ensemble ai rebalance` | 작업 재분배 |
| `ensemble analytics summary` | 협업 요약 |
| `ensemble analytics contributors` | 기여도 분석 |
| `ensemble analytics recommend` | 팀 추천 |
| `ensemble analytics report` | 전체 리포트 |

---

## 🗂️ 파일 구조

```
scripts/
├── ensemble.py                    # Main CLI (v5.3.0)
├── ensemble_server.py             # Phase 1: Context Sync Server
├── ensemble_client.py             # Phase 1: Agent Client SDK
├── ensemble_partition.py          # Phase 2: Partition Manager
├── ensemble_dashboard.py          # Phase 2: Web Dashboard
├── ensemble_orchestrator.py       # Phase 3: GCC-RT Orchestrator
├── ensemble_region_lock.py        # Phase 4: Region-Level Locking
├── ensemble_smart_partition.py    # Phase 4: Smart Partitioning
├── ensemble_orchestration_ai.py   # Phase 4: Orchestration AI
└── ensemble_analytics.py          # Phase 4: Analytics Engine
```

---

*Ensemble v5.3.0 — Complete Multi-Agent Workspace Architecture*
